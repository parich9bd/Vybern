import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Environment } from './config/env.js';
import type { KeyValueStore } from './lib/redis.js';
import type { SmsProvider } from './modules/auth/sms.provider.js';
import { buildApp } from './app.js';

const environment: Environment = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://user:pass@localhost:5432/test', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal',
  REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7,
  OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 900, SMS_PROVIDER: 'unconfigured', PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 5_000_000,
};

const redis: KeyValueStore = {
  async get() { return null; }, async getDel() { return null; }, async set() { return true; }, async del() { return 0; }, async increment() { return 1; }, async expire() { return undefined; }, async close() { return undefined; },
};
const prisma = { $disconnect: async () => undefined } as unknown as PrismaClient;
const sms: SmsProvider = { async deliverOtp() { return {}; } };

describe('Fastify route schemas', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => { await Promise.all(applications.splice(0).map((app) => app.close())); });

  it('compiles all routes during app.ready()', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    await app.ready();
    expect(app.hasRoute({ method: 'POST', url: '/api/v1/auth/otp/request' })).toBe(true);
  });

  it('publishes OpenAPI paths for representative public, customer and admin routes', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    await app.ready();
    const document = app.swagger();
    expect(document.paths).toEqual(expect.objectContaining({
      '/products': expect.any(Object),
      '/orders': expect.any(Object),
      '/account/profile': expect.any(Object),
      '/admin/settings': expect.any(Object),
    }));
  });

  it('documents concrete authentication responses without OTP or session-token fields', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    await app.ready();
    const paths = app.swagger().paths as Record<string, { post?: { responses: Record<string, { content?: Record<string, { schema: unknown }> }> }; get?: { security?: unknown; responses: Record<string, unknown> } }>;
    const requestSchema = paths['/auth/otp/request'].post?.responses['202'].content?.['application/json'].schema;
    expect(JSON.stringify(requestSchema)).not.toContain('developmentOtp');
    expect(JSON.stringify(requestSchema)).not.toContain('token');
    expect(paths['/auth/me'].get?.security).toEqual([{ cookieAuth: [] }]);
    expect(paths['/auth/logout'].post?.responses['204']).toBeDefined();
  });

  it('documents concrete customer account responses without session credentials', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    await app.ready();
    const paths = app.swagger().paths as Record<string, { get?: { security?: unknown; responses: Record<string, { content?: Record<string, { schema: unknown }> }> } }>;
    const sessionsSchema = paths['/account/sessions'].get?.responses['200'].content?.['application/json'].schema;
    expect(JSON.stringify(sessionsSchema)).not.toContain('tokenHash');
    expect(paths['/account/payments'].get?.security).toEqual([{ cookieAuth: [] }]);
    expect(paths['/account/profile'].get?.responses['200']).toBeDefined();
  });

  it('documents public catalogue responses without internal inventory fields', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    await app.ready();
    const paths = app.swagger().paths as Record<string, { get?: { responses: Record<string, { content?: Record<string, { schema: unknown }> }> } }>;
    const schema = paths['/products'].get?.responses['200'].content?.['application/json'].schema;
    expect(JSON.stringify(schema)).toContain('availableQuantity');
    expect(JSON.stringify(schema)).not.toContain('stockOnHand');
    expect(paths['/products/{slug}'].get?.responses['404']).toBeDefined();
  });

  it('documents checkout and customer orders with financial snapshots and CSRF', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    await app.ready();
    const paths = app.swagger().paths as Record<string, { post?: { security?: unknown; responses: Record<string, { content?: Record<string, { schema: unknown }> }> }; get?: { responses: Record<string, unknown> } }>;
    const createSchema = paths['/orders'].post?.responses['201'].content?.['application/json'].schema;
    expect(JSON.stringify(createSchema)).toContain('discountCode');
    expect(JSON.stringify(createSchema)).toContain('shippingMethod');
    expect(paths['/orders'].post?.security).toEqual([{ cookieAuth: [] }, { csrfToken: [] }]);
    expect(paths['/orders/{orderId}'].get?.responses['404']).toBeDefined();
  });

  it('never exposes a development OTP from a production-configured app', async () => {
    const productionEnvironment: Environment = {
      ...environment,
      NODE_ENV: 'production',
      AUTH_COOKIE_SECURE: true,
      SMS_PROVIDER: 'unconfigured',
    };
    const provider: SmsProvider = { async deliverOtp() { return { developmentCode: '123456' }; } };
    const app = await buildApp(productionEnvironment, prisma, redis, provider);
    applications.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone: '+447700900123' } });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ data: { accepted: true } });
  });

  it('returns a safe 400 response for Fastify schema validation failures', async () => {
    const app = await buildApp(environment, prisma, redis, sms);
    applications.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { phone: '+447700900123' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } });
  });

  it('requires both a session and CSRF token for cart mutations', async () => {
    const user = { id: 'user_1', phone: '+447700900123', firstName: null, lastName: null, role: 'CUSTOMER', status: 'ACTIVE' };
    const csrfToken = 'csrf-token-for-test';
    const authenticatedPrisma = {
      $disconnect: async () => undefined,
      session: {
        findUnique: async () => ({
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          csrfTokenHash: createHash('sha256').update(csrfToken).digest('hex'),
          user,
        }),
      },
    } as unknown as PrismaClient;
    const app = await buildApp(environment, authenticatedPrisma, redis, sms);
    applications.push(app);
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    const csrfRejected = await app.inject({
      method: 'POST', url: '/api/v1/cart/items',
      headers: { cookie: 'vybern_session=session-token' },
      payload: { variantId: 'variant_1', quantity: 1 },
    });
    const shippingAddress = { firstName: 'Test', lastName: 'Buyer', phone: '+989121234567', addressLine1: '1 Test Street', city: 'Tehran', region: 'Tehran', postalCode: '1234567890', countryCode: 'IR' };
    const orderUnauthenticated = await app.inject({
      method: 'POST', url: '/api/v1/orders', headers: { 'idempotency-key': 'idempotency-key-test-1234' }, payload: { shippingAddress },
    });
    const orderCsrfRejected = await app.inject({
      method: 'POST', url: '/api/v1/orders', headers: { cookie: 'vybern_session=session-token', 'idempotency-key': 'idempotency-key-test-5678' }, payload: { shippingAddress },
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(csrfRejected.statusCode).toBe(403);
    expect(orderUnauthenticated.statusCode).toBe(401);
    expect(orderCsrfRejected.statusCode).toBe(403);
  });
});
