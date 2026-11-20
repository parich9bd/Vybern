import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { normaliseE164Phone, otpRequestSchema, otpVerifySchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';

const errorResponse = {
  type: 'object', required: ['error'], additionalProperties: false,
  properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object', additionalProperties: true } } } },
} as const;
const userSchema = { type: 'object', required: ['id', 'phone', 'firstName', 'lastName', 'role'], additionalProperties: false, properties: { id: { type: 'string' }, phone: { type: 'string' }, firstName: { type: ['string', 'null'] }, lastName: { type: ['string', 'null'] }, role: { type: 'string' } } } as const;

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}

function serialiseUser(user: { id: string; phone: string; firstName: string | null; lastName: string | null; role: string }) {
  return { id: user.id, phone: user.phone, firstName: user.firstName, lastName: user.lastName, role: user.role };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const service = new AuthService(app.prisma, app.redis, app.smsProvider, app.environment);
  const cookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    secure: app.environment.AUTH_COOKIE_SECURE ?? false,
    sameSite: app.environment.AUTH_COOKIE_SAME_SITE,
    path: '/',
  };

  app.post('/auth/otp/request', {
    config: { rateLimit: false },
    schema: {
      tags: ['Authentication'],
      summary: 'Request a phone verification code',
      body: { type: 'object', required: ['phone'], properties: { phone: { type: 'string', examples: ['+447700900123'] } } },
      response: {
        202: {
          type: 'object', required: ['data'], additionalProperties: false,
          properties: {
            // Development-only fields are intentionally not part of the public contract.
            data: { type: 'object', required: ['accepted'], additionalProperties: true, properties: { accepted: { type: 'boolean' } } },
          },
        },
        400: errorResponse, 429: errorResponse, 503: errorResponse,
      },
    },
  }, async (request, reply) => {
    const { phone: rawPhone } = otpRequestSchema.parse(request.body);
    let phone: string;
    try { phone = normaliseE164Phone(rawPhone); } catch { throw new AppError(400, 'VALIDATION_ERROR', 'Phone number must be in E.164 format'); }
    const result = await service.requestOtp(phone, requestContext(request));
    return reply.status(202).send({ data: { accepted: true, ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {}) } });
  });

  app.post('/auth/otp/verify', {
    config: { rateLimit: false },
    schema: { tags: ['Authentication'], summary: 'Verify a phone code and establish a session', body: { type: 'object', required: ['phone', 'code'], additionalProperties: false, properties: { phone: { type: 'string' }, code: { type: 'string', pattern: '^\\d{6}$' } } }, response: { 200: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: { type: 'object', required: ['user', 'csrfToken', 'expiresAt'], additionalProperties: false, properties: { user: userSchema, csrfToken: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' } } } } }, 400: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const { phone: rawPhone, code } = otpVerifySchema.parse(request.body);
    let phone: string;
    try { phone = normaliseE164Phone(rawPhone); } catch { throw new AppError(400, 'VALIDATION_ERROR', 'Phone number must be in E.164 format'); }
    const result = await service.verifyOtp(phone, code, requestContext(request));
    reply.setCookie(app.environment.AUTH_COOKIE_NAME, result.token, { ...cookieOptions, expires: result.expiresAt });
    reply.setCookie(`${app.environment.AUTH_COOKIE_NAME}_csrf`, result.csrfToken, { ...cookieOptions, httpOnly: false, expires: result.expiresAt });
    return reply.status(200).send({ data: { user: serialiseUser(result.user), csrfToken: result.csrfToken, expiresAt: result.expiresAt.toISOString() } });
  });

  app.get('/auth/me', { schema: { tags: ['Authentication'], summary: 'Get the signed-in user', security: [{ cookieAuth: [] }], response: { 200: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: { type: 'object', required: ['user'], additionalProperties: false, properties: { user: userSchema } } } }, 401: errorResponse } } }, async (request) => {
    const token = request.cookies[app.environment.AUTH_COOKIE_NAME];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    const { user } = await service.currentUser(token);
    return { data: { user: serialiseUser(user) } };
  });

  app.post('/auth/logout', { schema: { tags: ['Authentication'], summary: 'Revoke the current session', security: [{ cookieAuth: [] }, { csrfToken: [] }], response: { 204: { type: 'null', description: 'Session cookie cleared' }, 401: errorResponse, 403: errorResponse } } }, async (request, reply) => {
    const token = request.cookies[app.environment.AUTH_COOKIE_NAME];
    if (token) {
      const session = await service.currentUser(token);
      if (!service.csrfMatches(session.csrfTokenHash, request.headers['x-csrf-token'] as string | undefined)) {
        throw new AppError(403, 'CSRF_INVALID', 'Invalid CSRF token');
      }
      await service.logout(token);
    }
    reply.clearCookie(app.environment.AUTH_COOKIE_NAME, cookieOptions);
    reply.clearCookie(`${app.environment.AUTH_COOKIE_NAME}_csrf`, { ...cookieOptions, httpOnly: false });
    return reply.status(204).send();
  });
}
