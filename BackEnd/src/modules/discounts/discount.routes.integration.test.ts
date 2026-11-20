import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DiscountRedemptionStatus, DiscountType, PrismaClient } from '@prisma/client';
import { buildApp } from '../../app.js';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import type { SmsProvider } from '../auth/sms.provider.js';
import { createVerifiedTestPrismaClient } from '../../test/test-database.js';

const suffix = `discount_route_${Date.now()}`;
let database: PrismaClient;
let appDatabase: PrismaClient;
let app: Awaited<ReturnType<typeof buildApp>>;
let userId: string;
let discountId: string;
let orderId: string;

const environment: Environment = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal', REDIS_URL: 'redis://localhost:6379',
  AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session',
  AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7, OTP_TTL_SECONDS: 300,
  OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5,
  OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 60, SMS_PROVIDER: 'unconfigured',
  PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media',
  MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000,
};

const redis: KeyValueStore = {
  async get() { return null; }, async getDel() { return null; }, async set() { return true; },
  async del() { return 0; }, async increment() { return 1; }, async expire() {}, async close() {},
};
const sms: SmsProvider = { async deliverOtp() { return {}; } };

describe('Discount validation lifecycle integration', () => {
  beforeAll(async () => {
    database = await createVerifiedTestPrismaClient();
    appDatabase = await createVerifiedTestPrismaClient();
    const user = await database.user.create({ data: { phone: `+989${String(Date.now()).slice(-9)}` } });
    userId = user.id;
    const token = `${suffix}-token`;
    await database.session.create({
      data: {
        userId, tokenHash: createHash('sha256').update(token).digest('hex'),
        csrfTokenHash: createHash('sha256').update('csrf').digest('hex'), expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const discount = await database.discount.create({
      data: { code: `${suffix}-code`.toUpperCase(), type: DiscountType.FIXED, amount: 1_000, perCustomerLimit: 1 },
    });
    discountId = discount.id;
    const order = await database.order.create({
      data: { userId, idempotencyKey: `${suffix}-order`, currency: 'IRR', subtotalMinor: 10_000, totalMinor: 10_000 },
    });
    orderId = order.id;
    await database.discountRedemption.create({
      data: { discountId, userId, orderId, amountMinor: 1_000, status: DiscountRedemptionStatus.RELEASED, releasedAt: new Date() },
    });
    app = await buildApp(environment, appDatabase, redis, sms);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await database.discountRedemption.deleteMany({ where: { orderId } });
    await database.order.deleteMany({ where: { id: orderId } });
    await database.discount.deleteMany({ where: { id: discountId } });
    await database.session.deleteMany({ where: { userId } });
    await database.user.deleteMany({ where: { id: userId } });
    await database.$disconnect();
  });

  it('does not count released redemptions against the customer discount limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/discounts/validate',
      headers: { cookie: `vybern_session=${suffix}-token` },
      payload: { code: `${suffix}-code`.toUpperCase(), subtotalMinor: 10_000, currency: 'IRR' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { discountMinor: 1_000, currency: 'IRR' } });
  });
});
