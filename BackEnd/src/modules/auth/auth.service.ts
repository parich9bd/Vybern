import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type { KeyValueStore } from '../../lib/redis.js';
import type { SmsProvider } from './sms.provider.js';

type Challenge = { digest: string; attemptsRemaining: number; expiresAt: number };
export type RequestContext = { ip: string; userAgent?: string };

const key = {
  challenge: (phone: string) => `auth:otp:challenge:${phone}`,
  cooldown: (phone: string) => `auth:otp:cooldown:${phone}`,
  lock: (phone: string) => `auth:otp:verify-lock:${phone}`,
  phoneRate: (phone: string) => `auth:otp:rate:phone:${phone}`,
  ipRate: (ip: string) => `auth:otp:rate:ip:${ip}`,
};

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly store: KeyValueStore,
    private readonly sms: SmsProvider,
    private readonly environment: Environment,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private otpDigest(phone: string, code: string): string {
    return createHmac('sha256', this.environment.AUTH_SECRET).update(`${phone}:${code}`).digest('hex');
  }

  private async consumeRateLimit(rateKey: string, limit: number): Promise<void> {
    const count = await this.store.increment(rateKey);
    if (count === 1) await this.store.expire(rateKey, this.environment.OTP_RATE_LIMIT_WINDOW_SECONDS);
    if (count > limit) throw new AppError(429, 'OTP_RATE_LIMITED', 'Please try again later', Math.max(1, await this.store.ttl?.(rateKey) ?? this.environment.OTP_RATE_LIMIT_WINDOW_SECONDS));
  }

  async requestOtp(phone: string, context: RequestContext): Promise<{ developmentOtp?: string; cooldownSeconds: number }> {
    if (await this.store.get(key.cooldown(phone))) throw new AppError(429, 'OTP_RESEND_COOLDOWN', 'Please wait before requesting another code', Math.max(1, await this.store.ttl?.(key.cooldown(phone)) ?? this.environment.OTP_RESEND_COOLDOWN_SECONDS));
    await this.consumeRateLimit(key.ipRate(context.ip), this.environment.OTP_REQUEST_LIMIT_PER_IP);
    await this.consumeRateLimit(key.phoneRate(phone), this.environment.OTP_REQUEST_LIMIT_PER_PHONE);

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const delivery = await this.sms.deliverOtp(phone, code).catch(() => {
      throw new AppError(503, 'SMS_UNAVAILABLE', 'Unable to send a verification code');
    });
    const challenge: Challenge = {
      digest: this.otpDigest(phone, code),
      attemptsRemaining: this.environment.OTP_MAX_ATTEMPTS,
      expiresAt: this.now().getTime() + this.environment.OTP_TTL_SECONDS * 1_000,
    };
    await this.store.set(key.challenge(phone), JSON.stringify(challenge), { expiresInSeconds: this.environment.OTP_TTL_SECONDS });
    await this.store.set(key.cooldown(phone), '1', { expiresInSeconds: this.environment.OTP_RESEND_COOLDOWN_SECONDS });
    return { cooldownSeconds: this.environment.OTP_RESEND_COOLDOWN_SECONDS, ...(this.environment.NODE_ENV === 'development' ? { developmentOtp: delivery.developmentCode } : {}) };
  }

  async verifyOtp(phone: string, code: string, context: RequestContext): Promise<{ token: string; csrfToken: string; user: User; expiresAt: Date }> {
    if (!await this.store.set(key.lock(phone), '1', { expiresInSeconds: 5, onlyIfNotExists: true })) {
      throw new AppError(409, 'OTP_VERIFICATION_IN_PROGRESS', 'Verification already in progress');
    }
    try {
      const stored = await this.store.get(key.challenge(phone));
      if (!stored) throw new AppError(400, 'OTP_INVALID_OR_EXPIRED', 'The verification code is invalid or expired');
      const challenge = JSON.parse(stored) as Challenge;
      if (challenge.expiresAt <= this.now().getTime()) {
        await this.store.del(key.challenge(phone));
        throw new AppError(400, 'OTP_INVALID_OR_EXPIRED', 'The verification code is invalid or expired');
      }
      const submitted = this.otpDigest(phone, code);
      const valid = timingSafeEqual(Buffer.from(challenge.digest, 'hex'), Buffer.from(submitted, 'hex'));
      if (!valid) {
        if (challenge.attemptsRemaining <= 1) {
          await this.store.del(key.challenge(phone));
        } else {
          await this.store.set(key.challenge(phone), JSON.stringify({ ...challenge, attemptsRemaining: challenge.attemptsRemaining - 1 }), { expiresInSeconds: Math.max(1, Math.ceil((challenge.expiresAt - this.now().getTime()) / 1_000)) });
        }
        throw new AppError(400, 'OTP_INVALID_OR_EXPIRED', 'The verification code is invalid or expired');
      }
      if (!await this.store.getDel(key.challenge(phone))) throw new AppError(400, 'OTP_INVALID_OR_EXPIRED', 'The verification code is invalid or expired');
      const user = await this.prisma.user.upsert({ where: { phone }, update: {}, create: { phone } });
      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(this.now().getTime() + this.environment.AUTH_SESSION_TTL_DAYS * 86_400_000);
      await this.prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), csrfTokenHash: sha256(csrfToken), expiresAt, ipAddress: context.ip, userAgent: context.userAgent?.slice(0, 512) } });
      return { token, csrfToken, user, expiresAt };
    } finally {
      await this.store.del(key.lock(phone));
    }
  }

  async currentUser(token: string): Promise<{ user: User; csrfTokenHash: string }> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= this.now() || session.user.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    return { user: session.user, csrfTokenHash: session.csrfTokenHash };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: this.now() } });
  }

  csrfMatches(expectedHash: string, csrfToken: string | undefined): boolean {
    if (!csrfToken) return false;
    const actual = sha256(csrfToken);
    return timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(actual, 'hex'));
  }
}
