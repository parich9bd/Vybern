import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { requireAuthenticatedUser } from '../auth/auth.guard.js';
import { hasAdminPermission, type AdminPermission } from './admin.permissions.js';

export async function requireAdminPermission(app: FastifyInstance, request: FastifyRequest, permission: AdminPermission) {
  const session = await requireAuthenticatedUser(app, request);
  if (!hasAdminPermission(session.user.role, permission)) {
    throw new AppError(403, 'ADMIN_PERMISSION_DENIED', 'Administrative permission required');
  }
  return session;
}
