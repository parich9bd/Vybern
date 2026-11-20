import 'dotenv/config';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import { buildApp } from '../../app.js';
import type { SmsProvider } from '../auth/sms.provider.js';

const database = new PrismaClient();
const appDatabase = new PrismaClient();
const suffix = `${Date.now()}`;
const environment: Environment = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal',
  REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7,
  OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 900, SMS_PROVIDER: 'unconfigured', PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000,
};
const redis: KeyValueStore = { async get() { return null; }, async getDel() { return null; }, async set() { return true; }, async del() { return 0; }, async increment() { return 1; }, async expire() { return undefined; }, async close() { return undefined; } };
const sms: SmsProvider = { async deliverOtp() { return {}; } };
let app: Awaited<ReturnType<typeof buildApp>>;
let adminId: string;
let supportId: string;
let customerId: string;
let counter = 0;
let originalSettings: Awaited<ReturnType<typeof database.storeSettings.findUnique>>;

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

async function credentials(userId: string): Promise<{ cookie: string; csrf: string }> {
  counter += 1;
  const token = `settings-${suffix}-${counter}`;
  const csrf = `csrf-settings-${suffix}-${counter}`;
  await database.session.create({ data: { userId, tokenHash: hash(token), csrfTokenHash: hash(csrf), expiresAt: new Date(Date.now() + 60_000) } });
  return { cookie: `vybern_session=${token}`, csrf };
}

describe('Store settings integration', () => {
  beforeAll(async () => {
    originalSettings = await database.storeSettings.findUnique({ where: { id: 1 } });
    adminId = (await database.user.create({ data: { phone: `+989${suffix.slice(-9)}`, role: UserRole.ADMIN } })).id;
    supportId = (await database.user.create({ data: { phone: `+988${suffix.slice(-9)}`, role: UserRole.SUPPORT } })).id;
    customerId = (await database.user.create({ data: { phone: `+987${suffix.slice(-9)}`, role: UserRole.CUSTOMER } })).id;
    app = await buildApp(environment, appDatabase, redis, sms);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const userIds = [adminId, supportId, customerId];
    await database.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await database.session.deleteMany({ where: { userId: { in: userIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    if (originalSettings) {
      await database.storeSettings.update({ where: { id: 1 }, data: {
        storeName: originalSettings.storeName, storeDescription: originalSettings.storeDescription,
        contactEmail: originalSettings.contactEmail, contactPhone: originalSettings.contactPhone,
        supportInfo: originalSettings.supportInfo, supportedLanguages: originalSettings.supportedLanguages,
        defaultLanguage: originalSettings.defaultLanguage, defaultCurrency: originalSettings.defaultCurrency,
        maintenanceMode: originalSettings.maintenanceMode, seoTitle: originalSettings.seoTitle,
        seoDescription: originalSettings.seoDescription,
      } });
    }
    await database.$disconnect();
  });

  it('returns public information without exposing environment configuration', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ defaultCurrency: 'IRR' });
    expect(response.json().data.storeName).toEqual(expect.any(String));
    expect(response.body).not.toContain('AUTH_SECRET');
  });

  it('requires SETTINGS_MANAGE and CSRF protection for updates, then writes an audit record', async () => {
    const customer = await credentials(customerId);
    const denied = await app.inject({ method: 'PATCH', url: '/api/v1/admin/settings', headers: { cookie: customer.cookie, 'x-csrf-token': customer.csrf }, payload: { storeName: 'Denied' } });
    expect(denied.statusCode).toBe(403);

    const admin = await credentials(adminId);
    const csrfDenied = await app.inject({ method: 'PATCH', url: '/api/v1/admin/settings', headers: { cookie: admin.cookie }, payload: { storeName: 'Denied' } });
    expect(csrfDenied.statusCode).toBe(403);

    const updated = await app.inject({
      method: 'PATCH', url: '/api/v1/admin/settings', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
      payload: { storeName: 'VYBERN Test', supportedLanguages: ['en', 'fa'], defaultLanguage: 'fa', maintenanceMode: true },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({ storeName: 'VYBERN Test', maintenanceMode: true });
    expect(await database.auditLog.findFirst({ where: { actorUserId: adminId, action: 'STORE_SETTINGS_UPDATED' } })).not.toBeNull();
  });

  it('rejects a default language outside the final supported-language set', async () => {
    const admin = await credentials(adminId);
    const response = await app.inject({
      method: 'PATCH', url: '/api/v1/admin/settings', headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf },
      payload: { supportedLanguages: ['en'], defaultLanguage: 'fa' },
    });
    expect(response.statusCode).toBe(400);
  });
});
