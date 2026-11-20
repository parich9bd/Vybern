import 'dotenv/config';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import type { SmsProvider } from '../auth/sms.provider.js';
import { MockPaymentProvider } from '../payments/payment.provider.js';
import { buildApp } from '../../app.js';
import { AuditService } from './audit.service.js';

const database = new PrismaClient();
const appDatabase = new PrismaClient();
const suffix = `admin_test_${Date.now()}`;
const environment: Environment = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://user:pass@localhost:5432/test', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal',
  REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7,
  OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 900, SMS_PROVIDER: 'unconfigured', PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000,
};
const redis: KeyValueStore = { async get() { return null; }, async getDel() { return null; }, async set() { return true; }, async del() { return 0; }, async increment() { return 1; }, async expire() { return undefined; }, async close() { return undefined; } };
const sms: SmsProvider = { async deliverOtp() { return {}; } };
let app: Awaited<ReturnType<typeof buildApp>>;
let adminId: string;
let customerId: string;
let supportId: string;
let sessionCounter = 0;

function tokenFor(userId: string): string { sessionCounter += 1; return `session-${userId}-${sessionCounter}`; }
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }

async function sessionCookie(userId: string): Promise<string> {
  const token = tokenFor(userId);
  await database.session.create({ data: { userId, tokenHash: tokenHash(token), csrfTokenHash: tokenHash(`csrf-${userId}`), expiresAt: new Date(Date.now() + 60_000) } });
  return `vybern_session=${token}`;
}

describe('Administration RBAC integration', () => {
  beforeAll(async () => {
    adminId = (await database.user.create({ data: { phone: '+447700900111', role: UserRole.ADMIN } })).id;
    customerId = (await database.user.create({ data: { phone: '+447700900222', role: UserRole.CUSTOMER } })).id;
    supportId = (await database.user.create({ data: { phone: '+447700900333', role: UserRole.SUPPORT } })).id;
    app = await buildApp(environment, appDatabase, redis, sms, new MockPaymentProvider());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await database.auditLog.deleteMany({ where: { actorUserId: { in: [adminId, customerId, supportId] } } });
    await database.session.deleteMany({ where: { userId: { in: [adminId, customerId, supportId] } } });
    await database.user.deleteMany({ where: { id: { in: [adminId, customerId, supportId] } } });
    await database.$disconnect();
  });

  it('denies admin routes by default and permits the assigned role only', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/admin/me' });
    const customer = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: await sessionCookie(customerId) } });
    const admin = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: await sessionCookie(adminId) } });
    expect(anonymous.statusCode).toBe(401);
    expect(customer.statusCode).toBe(403);
    expect(admin.statusCode).toBe(200);
    expect(admin.json().data.role).toBe(UserRole.ADMIN);
  });

  it('serves real dashboard data only to a permitted administrator', async () => {
    const customer = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie: await sessionCookie(customerId) } });
    const admin = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie: await sessionCookie(adminId) } });
    expect(customer.statusCode).toBe(403);
    expect(admin.statusCode).toBe(200);
    expect(admin.json().data.metrics).toHaveProperty('realRevenueMinor');
  });

  it('writes auditable sensitive actions with actor attribution', async () => {
    await new AuditService(database).record(adminId, 'ADMIN_TEST_ACTION', 'TestTarget', { ip: '127.0.0.1', headers: { 'user-agent': 'vitest' } } as never, 'target_1', { source: suffix });
    const log = await database.auditLog.findFirstOrThrow({ where: { actorUserId: adminId, action: 'ADMIN_TEST_ACTION' } });
    expect(log).toMatchObject({ targetType: 'TestTarget', targetId: 'target_1', ipAddress: '127.0.0.1' });
  });

  it('applies least-privilege RBAC to order, customer and payment monitoring routes', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/admin/orders' });
    const customer = await app.inject({ method: 'GET', url: '/api/v1/admin/orders', headers: { cookie: await sessionCookie(customerId) } });
    const adminOrders = await app.inject({ method: 'GET', url: '/api/v1/admin/orders?limit=1', headers: { cookie: await sessionCookie(adminId) } });
    const adminCustomers = await app.inject({ method: 'GET', url: '/api/v1/admin/customers', headers: { cookie: await sessionCookie(adminId) } });
    const supportCustomers = await app.inject({ method: 'GET', url: '/api/v1/admin/customers?search=900222', headers: { cookie: await sessionCookie(supportId) } });
    const supportPayments = await app.inject({ method: 'GET', url: '/api/v1/admin/payments', headers: { cookie: await sessionCookie(supportId) } });
    expect(anonymous.statusCode).toBe(401);
    expect(customer.statusCode).toBe(403);
    expect(adminOrders.statusCode).toBe(200);
    expect(adminCustomers.statusCode).toBe(200);
    expect(supportCustomers.statusCode).toBe(200);
    expect(supportPayments.statusCode).toBe(200);
  });
});
