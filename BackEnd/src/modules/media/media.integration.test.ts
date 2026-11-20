import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, ProductStatus, UserRole } from '@prisma/client';
import type { Environment } from '../../config/env.js';
import type { KeyValueStore } from '../../lib/redis.js';
import { buildApp } from '../../app.js';
import type { SmsProvider } from '../auth/sms.provider.js';
import { MockPaymentProvider } from '../payments/payment.provider.js';
import { LocalMediaStorage } from './media.storage.js';

const database = new PrismaClient();
const appDatabase = new PrismaClient();
const suffix = `${Date.now()}`;
const csrfToken = 'media-csrf-token';
const environment: Environment = {
  NODE_ENV: 'test', PORT: 3001, HOST: '127.0.0.1', DATABASE_URL: 'postgresql://user:pass@localhost:5432/test', CORS_ORIGIN: 'http://localhost:3000', LOG_LEVEL: 'fatal',
  REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 'a-very-long-test-secret-that-is-at-least-32-characters', AUTH_COOKIE_NAME: 'vybern_session', AUTH_COOKIE_SECURE: false, AUTH_COOKIE_SAME_SITE: 'lax', AUTH_SESSION_TTL_DAYS: 7,
  OTP_TTL_SECONDS: 300, OTP_RESEND_COOLDOWN_SECONDS: 60, OTP_MAX_ATTEMPTS: 5, OTP_REQUEST_LIMIT_PER_PHONE: 5, OTP_REQUEST_LIMIT_PER_IP: 10, OTP_RATE_LIMIT_WINDOW_SECONDS: 900, SMS_PROVIDER: 'unconfigured', PAYMENT_PROVIDER: 'unconfigured', ORDER_EXPIRATION_INTERVAL_SECONDS: 60, MEDIA_STORAGE_PATH: './private/test-media', MEDIA_MAX_FILE_SIZE_BYTES: 1024,
};
const redis: KeyValueStore = { async get() { return null; }, async getDel() { return null; }, async set() { return true; }, async del() { return 0; }, async increment() { return 1; }, async expire() { return undefined; }, async close() { return undefined; } };
const sms: SmsProvider = { async deliverOtp() { return {}; } };
let app: Awaited<ReturnType<typeof buildApp>>;
let mediaRoot: string;
let adminId: string;
let productId: string;
let firstMediaId: string;
let firstImageId: string;

function multipart(filename: string, contents: Buffer): { headers: Record<string, string>; payload: Buffer } {
  const boundary = '----vybern-media-test';
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`), contents, Buffer.from(`\r\n--${boundary}--\r\n`)] ) };
}
function png(marker = 1): Buffer { return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, marker]); }
function cookie(): string { return 'vybern_session=media-admin-session'; }

describe('Media library integration', () => {
  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'vybern-media-'));
    adminId = (await database.user.create({ data: { phone: `+4478${suffix.slice(-8).padStart(8, '0')}`, role: UserRole.ADMIN } })).id;
    await database.session.create({ data: { userId: adminId, tokenHash: createHash('sha256').update('media-admin-session').digest('hex'), csrfTokenHash: createHash('sha256').update(csrfToken).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
    const category = await database.category.create({ data: { slug: `media-category-${suffix}`, translations: { create: { locale: 'en', name: 'Media category' } } } });
    productId = (await database.product.create({ data: { slug: `media-product-${suffix}`, sku: `MEDIA-${suffix}`, categoryId: category.id, basePriceMinor: 100, currency: 'IRR', status: ProductStatus.ACTIVE, translations: { create: { locale: 'en', name: 'Media product' } } } })).id;
    app = await buildApp(environment, appDatabase, redis, sms, new MockPaymentProvider(), new LocalMediaStorage(mediaRoot));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await database.product.delete({ where: { id: productId } });
    await database.mediaAsset.deleteMany({ where: { createdByUserId: adminId } });
    await database.category.deleteMany({ where: { slug: `media-category-${suffix}` } });
    await database.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await database.session.deleteMany({ where: { userId: adminId } });
    await database.user.delete({ where: { id: adminId } });
    await database.$disconnect();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  it('requires admin authentication and accepts only genuine image signatures', async () => {
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/admin/media' });
    const bad = multipart('shell.png', Buffer.from('#!/bin/sh\necho bad'));
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/admin/media', headers: { ...bad.headers, cookie: cookie(), 'x-csrf-token': csrfToken }, payload: bad.payload });
    expect(unauthenticated.statusCode).toBe(401);
    expect(invalid.statusCode).toBe(400);
  });

  it('uploads, deduplicates, audits, assigns and reorders images securely', async () => {
    const first = multipart('../../traversal.png', png(1));
    const uploaded = await app.inject({ method: 'POST', url: '/api/v1/admin/media', headers: { ...first.headers, cookie: cookie(), 'x-csrf-token': csrfToken }, payload: first.payload });
    expect(uploaded.statusCode).toBe(201);
    firstMediaId = uploaded.json().data.id;
    expect(uploaded.json().data.originalName).toBe('traversal.png');
    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/admin/media', headers: { ...first.headers, cookie: cookie(), 'x-csrf-token': csrfToken }, payload: first.payload });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().data.id).toBe(firstMediaId);
    const metadata = await app.inject({ method: 'PATCH', url: `/api/v1/admin/media/${firstMediaId}`, headers: { cookie: cookie(), 'x-csrf-token': csrfToken }, payload: { altText: { en: 'Frame front', fa: 'نمای جلو', de: 'Vorderansicht' } } });
    expect(metadata.statusCode).toBe(200);
    const assigned = await app.inject({ method: 'POST', url: `/api/v1/admin/products/${productId}/images`, headers: { cookie: cookie(), 'x-csrf-token': csrfToken }, payload: { mediaAssetId: firstMediaId } });
    expect(assigned.statusCode).toBe(201);
    firstImageId = assigned.json().data.id;
    const secondPayload = multipart('second.png', png(2));
    const secondUpload = await app.inject({ method: 'POST', url: '/api/v1/admin/media', headers: { ...secondPayload.headers, cookie: cookie(), 'x-csrf-token': csrfToken }, payload: secondPayload.payload });
    const secondId = secondUpload.json().data.id;
    const secondAssign = await app.inject({ method: 'POST', url: `/api/v1/admin/products/${productId}/images`, headers: { cookie: cookie(), 'x-csrf-token': csrfToken }, payload: { mediaAssetId: secondId } });
    const secondImageId = secondAssign.json().data.id;
    const reordered = await app.inject({ method: 'PATCH', url: `/api/v1/admin/products/${productId}/images/order`, headers: { cookie: cookie(), 'x-csrf-token': csrfToken }, payload: { imageIds: [secondImageId, firstImageId] } });
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json().data[0].id).toBe(secondImageId);
    const protectedDeletion = await app.inject({ method: 'DELETE', url: `/api/v1/admin/media/${firstMediaId}`, headers: { cookie: cookie(), 'x-csrf-token': csrfToken } });
    expect(protectedDeletion.statusCode).toBe(409);
    const unusedPayload = multipart('unused.png', png(9));
    const unusedUpload = await app.inject({ method: 'POST', url: '/api/v1/admin/media', headers: { ...unusedPayload.headers, cookie: cookie(), 'x-csrf-token': csrfToken }, payload: unusedPayload.payload });
    const unusedId = unusedUpload.json().data.id;
    const softDeleted = await app.inject({ method: 'DELETE', url: `/api/v1/admin/media/${unusedId}`, headers: { cookie: cookie(), 'x-csrf-token': csrfToken } });
    expect(softDeleted.statusCode).toBe(204);
    const listed = await app.inject({ method: 'GET', url: '/api/v1/admin/media', headers: { cookie: cookie() } });
    expect(listed.json().data.some((asset: { id: string }) => asset.id === unusedId)).toBe(false);
    expect(await database.auditLog.findFirst({ where: { actorUserId: adminId, action: 'PRODUCT_MEDIA_REORDERED' } })).not.toBeNull();
  });

  it('enforces the configured upload size limit', async () => {
    const oversized = multipart('large.png', Buffer.concat([png(3), Buffer.alloc(1024)]));
    const response = await app.inject({ method: 'POST', url: '/api/v1/admin/media', headers: { ...oversized.headers, cookie: cookie(), 'x-csrf-token': csrfToken }, payload: oversized.payload });
    expect(response.statusCode).toBe(413);
  });
});
