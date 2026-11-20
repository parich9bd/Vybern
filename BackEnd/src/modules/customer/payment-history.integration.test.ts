import 'dotenv/config';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentProvider, PaymentStatus, PrismaClient, UserRole } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import type { SmsProvider } from '../auth/sms.provider.js';
import { buildApp } from '../../app.js';

const database = new PrismaClient();
const appDatabase = new PrismaClient();
const suffix = String(Date.now()).slice(-8);
const environment: Environment = { NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal', REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7, OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 60, SMS_PROVIDER: 'unconfigured', PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000 };
const redis: KeyValueStore = { async get() { return null; }, async getDel() { return null; }, async set() { return true; }, async del() { return 0; }, async increment() { return 1; }, async expire() { return undefined; }, async close() { return undefined; } };
const sms: SmsProvider = { async deliverOtp() { return {}; } };
let app: Awaited<ReturnType<typeof buildApp>>;
let ownerId: string; let otherId: string; let ownerToken: string;
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
async function paymentFor(userId: string, index: number) {
  const order = await database.order.create({ data: { userId, idempotencyKey: `history-${suffix}-${userId}-${index}`, currency: 'IRR', subtotalMinor: index, totalMinor: index } });
  await database.payment.create({ data: { orderId: order.id, provider: PaymentProvider.MOCK, status: PaymentStatus.SUCCEEDED, amountMinor: index, currency: 'IRR' } });
}
describe('Customer payment history integration', () => {
  beforeAll(async () => {
    ownerId = (await database.user.create({ data: { phone: `+98921${suffix}`, role: UserRole.CUSTOMER } })).id;
    otherId = (await database.user.create({ data: { phone: `+98922${suffix}`, role: UserRole.CUSTOMER } })).id;
    ownerToken = `history-token-${suffix}`;
    await database.session.create({ data: { userId: ownerId, tokenHash: hash(ownerToken), csrfTokenHash: hash('csrf'), expiresAt: new Date(Date.now() + 60_000) } });
    await Promise.all([paymentFor(ownerId, 1), paymentFor(ownerId, 2), paymentFor(otherId, 99)]);
    app = await buildApp(environment, appDatabase, redis, sms); await app.ready();
  });
  afterAll(async () => { await app.close(); const ids = [ownerId, otherId]; await database.payment.deleteMany({ where: { order: { userId: { in: ids } } } }); await database.order.deleteMany({ where: { userId: { in: ids } } }); await database.session.deleteMany({ where: { userId: { in: ids } } }); await database.user.deleteMany({ where: { id: { in: ids } } }); await database.$disconnect(); });
  it('requires authentication and returns only paginated owned safe records', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/account/payments' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/api/v1/account/payments?page=1&limit=1', headers: { cookie: `vybern_session=${ownerToken}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ meta: { page: 1, limit: 1, total: 2 }, data: [{ amount: { currency: 'IRR' } }] });
    expect(response.body).not.toContain('tokenHash');
    expect(response.body).not.toContain('providerReference');
    expect(response.body).not.toContain('99');
  });
});
