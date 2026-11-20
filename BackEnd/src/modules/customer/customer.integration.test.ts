import 'dotenv/config';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import type { SmsProvider } from '../auth/sms.provider.js';
import { MockPaymentProvider } from '../payments/payment.provider.js';
import { buildApp } from '../../app.js';

const database = new PrismaClient();
const appDatabase = new PrismaClient();
const suffix = `${Date.now()}`;
const environment: Environment = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://user:pass@localhost:5432/test', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal', REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7, OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 900, SMS_PROVIDER: 'unconfigured', PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000,
};
const redis: KeyValueStore = { async get() { return null; }, async getDel() { return null; }, async set() { return true; }, async del() { return 0; }, async increment() { return 1; }, async expire() { return undefined; }, async close() { return undefined; } };
const sms: SmsProvider = { async deliverOtp() { return {}; } };
let app: Awaited<ReturnType<typeof buildApp>>;
let firstUserId: string;
let secondUserId: string;
const csrf = 'customer-csrf-token';
const firstToken = `customer-token-${suffix}`;
let firstSessionId: string;

async function createSession(userId: string, token: string, csrfToken = csrf) {
  return database.session.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), csrfTokenHash: createHash('sha256').update(csrfToken).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
}
function headers(token = firstToken) { return { cookie: `vybern_session=${token}`, 'x-csrf-token': csrf }; }

describe('Customer account integration', () => {
  beforeAll(async () => {
    firstUserId = (await database.user.create({ data: { phone: `+4476${suffix.slice(-8).padStart(8, '0')}`, role: UserRole.CUSTOMER, firstName: 'First' } })).id;
    secondUserId = (await database.user.create({ data: { phone: `+4475${suffix.slice(-8).padStart(8, '0')}`, role: UserRole.CUSTOMER } })).id;
    firstSessionId = (await createSession(firstUserId, firstToken)).id;
    await createSession(secondUserId, `second-token-${suffix}`);
    app = await buildApp(environment, appDatabase, redis, sms, new MockPaymentProvider());
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await database.session.deleteMany({ where: { userId: { in: [firstUserId, secondUserId] } } });
    await database.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await database.$disconnect();
  });
  it('updates only the authenticated profile and never exposes tokens', async () => {
    const update = await app.inject({ method: 'PATCH', url: '/api/v1/account/profile', headers: headers(), payload: { firstName: 'Updated' } });
    expect(update.statusCode).toBe(200);
    const sessions = await app.inject({ method: 'GET', url: '/api/v1/account/sessions', headers: headers() });
    expect(sessions.statusCode).toBe(200);
    expect(sessions.body).not.toContain(firstToken);
  });
  it('enforces session ownership and revokes an owned session', async () => {
    const foreign = await database.session.findFirstOrThrow({ where: { userId: secondUserId } });
    const denied = await app.inject({ method: 'DELETE', url: `/api/v1/account/sessions/${foreign.id}`, headers: headers() });
    expect(denied.statusCode).toBe(404);
    const revoked = await app.inject({ method: 'DELETE', url: `/api/v1/account/sessions/${firstSessionId}`, headers: headers() });
    expect(revoked.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/v1/account/profile', headers: { cookie: `vybern_session=${firstToken}` } });
    expect(after.statusCode).toBe(401);
  });
  it('rejects an otherwise valid session after account suspension', async () => {
    const token = `suspended-token-${suffix}`;
    await createSession(secondUserId, token);
    await database.user.update({ where: { id: secondUserId }, data: { status: 'SUSPENDED' } });
    const response = await app.inject({ method: 'GET', url: '/api/v1/account/profile', headers: { cookie: `vybern_session=${token}` } });
    expect(response.statusCode).toBe(401);
  });
});
