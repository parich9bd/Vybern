import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import { AuthService } from './auth.service.js';
import type { SmsProvider } from './sms.provider.js';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async getDel(key: string) { const value = await this.get(key); this.values.delete(key); return value; }
  async set(key: string, value: string, options?: { onlyIfNotExists?: boolean }) { if (options?.onlyIfNotExists && this.values.has(key)) return false; this.values.set(key, value); return true; }
  async del(key: string) { return this.values.delete(key) ? 1 : 0; }
  async increment(key: string) { const next = Number(this.values.get(key) ?? '0') + 1; this.values.set(key, String(next)); return next; }
  async expire() { return undefined; }
  async close() { return undefined; }
}

const environment: Environment = {
  NODE_ENV: 'development', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://user:pass@localhost:5432/test', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal',
  REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7,
  OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 2, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 900, SMS_PROVIDER: 'development', PAYMENT_PROVIDER: 'mock', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000,
};

function dependencies() {
  const store = new MemoryStore();
  const user = { id: 'user_1', phone: '+447700900123', firstName: null, lastName: null, role: 'CUSTOMER', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
  const prisma = { user: { upsert: async () => user }, session: { create: async () => ({}) } } as unknown as PrismaClient;
  const sms: SmsProvider = { async deliverOtp(_phone, code) { return { developmentCode: code }; } };
  return { store, prisma, sms };
}

describe('phone OTP authentication', () => {
  it('creates an opaque session after a valid one-time code', async () => {
    const { store, prisma, sms } = dependencies();
    const service = new AuthService(prisma, store, sms, environment);
    const requested = await service.requestOtp('+447700900123', { ip: '127.0.0.1' });
    const verified = await service.verifyOtp('+447700900123', requested.developmentOtp!, { ip: '127.0.0.1' });
    expect(verified.user.phone).toBe('+447700900123');
    expect(verified.token).toHaveLength(43);
    expect(verified.csrfToken).toHaveLength(43);
  });

  it('rejects an incorrect code and does not allow a consumed code to be reused', async () => {
    const { store, prisma, sms } = dependencies();
    const service = new AuthService(prisma, store, sms, environment);
    const requested = await service.requestOtp('+447700900123', { ip: '127.0.0.1' });
    await expect(service.verifyOtp('+447700900123', '000000', { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await service.verifyOtp('+447700900123', requested.developmentOtp!, { ip: '127.0.0.1' });
    await expect(service.verifyOtp('+447700900123', requested.developmentOtp!, { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
  });

  it('enforces resend cooldown without revealing account state', async () => {
    const { store, prisma, sms } = dependencies();
    const service = new AuthService(prisma, store, sms, environment);
    await service.requestOtp('+447700900123', { ip: '127.0.0.1' });
    await expect(service.requestOtp('+447700900123', { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_RESEND_COOLDOWN' });
  });

  it('rejects an expired code even if a Redis key outlives its TTL', async () => {
    const { store, prisma, sms } = dependencies();
    let clock = new Date('2026-01-01T00:00:00.000Z');
    const service = new AuthService(prisma, store, sms, environment, () => clock);
    const requested = await service.requestOtp('+447700900123', { ip: '127.0.0.1' });
    clock = new Date(clock.getTime() + 301_000);
    await expect(service.verifyOtp('+447700900123', requested.developmentOtp!, { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
  });

  it('invalidates a challenge after its maximum verification attempts', async () => {
    const { store, prisma, sms } = dependencies();
    const service = new AuthService(prisma, store, sms, environment);
    const requested = await service.requestOtp('+447700900123', { ip: '127.0.0.1' });
    await expect(service.verifyOtp('+447700900123', '000000', { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(service.verifyOtp('+447700900123', '000000', { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(service.verifyOtp('+447700900123', requested.developmentOtp!, { ip: '127.0.0.1' })).rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
  });
});
