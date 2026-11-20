import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { AuthService } from './auth.service.js';

export async function requireAuthenticatedUser(app: FastifyInstance, request: FastifyRequest) {
  const token = request.cookies[app.environment.AUTH_COOKIE_NAME];
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const auth = new AuthService(app.prisma, app.redis, app.smsProvider, app.environment);
  const session = await auth.currentUser(token);
  return { auth, token, ...session };
}

export function requireCsrf(auth: AuthService, csrfTokenHash: string, request: FastifyRequest): void {
  const csrfToken = request.headers['x-csrf-token'];
  if (!auth.csrfMatches(csrfTokenHash, typeof csrfToken === 'string' ? csrfToken : undefined)) {
    throw new AppError(403, 'CSRF_INVALID', 'Invalid CSRF token');
  }
}
