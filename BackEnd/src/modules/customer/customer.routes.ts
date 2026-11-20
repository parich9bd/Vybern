import type { FastifyInstance } from 'fastify';
import { requireAuthenticatedUser, requireCsrf } from '../auth/auth.guard.js';
import { AppError } from '../../lib/errors.js';
import { paymentHistoryQuerySchema, sessionParamsSchema, updateProfileSchema } from './customer.schemas.js';
import { AvatarService } from './avatar.service.js';

const errorResponse = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' } } } } } as const;
const userSchema = { type: 'object', required: ['id', 'phone', 'firstName', 'lastName', 'status', 'avatarUrl'], additionalProperties: false, properties: { id: { type: 'string' }, phone: { type: 'string' }, firstName: { type: ['string', 'null'] }, lastName: { type: ['string', 'null'] }, status: { type: 'string' }, avatarUrl: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' } } } as const;
const sessionSchema = { type: 'object', required: ['id', 'ipAddress', 'userAgent', 'createdAt', 'lastSeenAt', 'expiresAt'], additionalProperties: false, properties: { id: { type: 'string' }, ipAddress: { type: ['string', 'null'] }, userAgent: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' }, lastSeenAt: { type: 'string', format: 'date-time' }, expiresAt: { type: 'string', format: 'date-time' } } } as const;
const paymentSchema = { type: 'object', required: ['id', 'orderId', 'provider', 'status', 'amount', 'verifiedAt', 'expiresAt', 'createdAt'], additionalProperties: false, properties: { id: { type: 'string' }, orderId: { type: 'string' }, provider: { type: 'string' }, status: { type: 'string' }, amount: { type: 'object', required: ['amountMinor', 'currency'], additionalProperties: false, properties: { amountMinor: { type: 'integer' }, currency: { type: 'string' } } }, verifiedAt: { type: ['string', 'null'], format: 'date-time' }, expiresAt: { type: ['string', 'null'], format: 'date-time' }, createdAt: { type: 'string', format: 'date-time' } } } as const;
const metaSchema = { type: 'object', required: ['page', 'limit', 'total', 'totalPages'], additionalProperties: false, properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } as const;

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  const avatars = new AvatarService(app.prisma, app.mediaStorage, app.environment.MEDIA_MAX_FILE_SIZE_BYTES);
  const serialiseUser = (user: { id: string; phone: string; firstName: string | null; lastName: string | null; status: string; createdAt: Date; avatarKey: string | null; avatarUpdatedAt: Date | null }) => ({ id: user.id, phone: user.phone, firstName: user.firstName, lastName: user.lastName, status: user.status, createdAt: user.createdAt.toISOString(), avatarUrl: user.avatarKey && user.avatarUpdatedAt ? `/api/v1/account/avatar?v=${user.avatarUpdatedAt.getTime()}` : null });
  app.get('/account/profile', { schema: { tags: ['Customer account'], summary: 'Get the authenticated customer profile', security: [{ cookieAuth: [] }], response: { 200: { type: 'object', required: ['data'], properties: { data: userSchema } }, 401: errorResponse } } }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    return { data: serialiseUser(user) };
  });

  app.patch('/account/profile', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['Customer account'], summary: 'Update own profile', security: [{ cookieAuth: [] }, { csrfToken: [] }], response: { 200: { type: 'object', required: ['data'], properties: { data: userSchema } }, 400: errorResponse, 401: errorResponse, 403: errorResponse } } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const input = updateProfileSchema.parse(request.body);
    const updated = await app.prisma.user.update({ where: { id: user.id }, data: input, select: { id: true, phone: true, firstName: true, lastName: true, status: true, createdAt: true, avatarKey: true, avatarUpdatedAt: true } });
    return { data: serialiseUser(updated) };
  });

  app.post('/account/avatar', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['Customer account'], summary: 'Upload or replace own avatar', security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const file = await request.file({ limits: { files: 1, fileSize: app.environment.MEDIA_MAX_FILE_SIZE_BYTES } });
    if (!file || file.fieldname !== 'avatar') throw new AppError(400, 'INVALID_AVATAR_UPLOAD', 'A single avatar file is required');
    let contents: Buffer;
    try { contents = await file.toBuffer(); } catch { throw new AppError(413, 'AVATAR_TOO_LARGE', 'Avatar exceeds the configured file size limit'); }
    if (file.file.truncated) throw new AppError(413, 'AVATAR_TOO_LARGE', 'Avatar exceeds the configured file size limit');
    const avatar = await avatars.replace(user.id, contents);
    return reply.status(201).send({ data: { avatarUrl: `/api/v1/account/avatar?v=${avatar.avatarUpdatedAt?.getTime() ?? Date.now()}` } });
  });

  app.get('/account/avatar', { schema: { tags: ['Customer account'], summary: 'Read own avatar', security: [{ cookieAuth: [] }] } }, async (request, reply) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const avatar = await avatars.content(user.id);
    return reply.type(avatar.contentType).header('cache-control', 'private, max-age=3600').send(avatar.contents);
  });

  app.delete('/account/avatar', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['Customer account'], summary: 'Remove own avatar', security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    await avatars.remove(user.id);
    return reply.status(204).send();
  });

  app.get('/account/sessions', { schema: { tags: ['Customer account'], summary: 'List own active sessions', security: [{ cookieAuth: [] }], response: { 200: { type: 'object', required: ['data'], properties: { data: { type: 'array', items: sessionSchema } } }, 401: errorResponse } } }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const sessions = await app.prisma.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, ipAddress: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true }, orderBy: { lastSeenAt: 'desc' } });
    return { data: sessions.map((session) => ({ ...session, createdAt: session.createdAt.toISOString(), lastSeenAt: session.lastSeenAt.toISOString(), expiresAt: session.expiresAt.toISOString() })) };
  });

  app.get('/account/payments', { schema: { tags: ['Customer account'], summary: 'List own payment history', security: [{ cookieAuth: [] }], response: { 200: { type: 'object', required: ['data', 'meta'], properties: { data: { type: 'array', items: paymentSchema }, meta: metaSchema } }, 401: errorResponse } } }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const { page, limit } = paymentHistoryQuerySchema.parse(request.query);
    const where = { order: { userId: user.id } };
    const [payments, total] = await app.prisma.$transaction([
      app.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: { id: true, orderId: true, provider: true, status: true, amountMinor: true, currency: true, verifiedAt: true, expiresAt: true, createdAt: true } }),
      app.prisma.payment.count({ where }),
    ]);
    return { data: payments.map((payment) => ({ id: payment.id, orderId: payment.orderId, provider: payment.provider, status: payment.status, amount: { amountMinor: payment.amountMinor, currency: payment.currency }, verifiedAt: payment.verifiedAt?.toISOString() ?? null, expiresAt: payment.expiresAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString() })), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });

  app.delete('/account/sessions/:sessionId', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['Customer account'], summary: 'Revoke one own session', security: [{ cookieAuth: [] }, { csrfToken: [] }], response: { 204: { type: 'null' }, 401: errorResponse, 403: errorResponse, 404: errorResponse } } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const revoked = await app.prisma.session.updateMany({ where: { id: sessionId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (revoked.count !== 1) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
    return reply.status(204).send();
  });

  app.post('/account/deactivation-request', { config: { rateLimit: { max: 3, timeWindow: '1 day' } }, schema: { tags: ['Customer account'], summary: 'Deactivate own account and revoke sessions', security: [{ cookieAuth: [] }, { csrfToken: [] }], response: { 204: { type: 'null' }, 401: errorResponse, 403: errorResponse } } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    await app.prisma.$transaction([
      app.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } }),
      app.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return reply.status(204).send();
  });
}
