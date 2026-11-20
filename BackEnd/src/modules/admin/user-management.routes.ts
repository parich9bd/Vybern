import type { FastifyInstance } from 'fastify';
import { requireAdminPermission } from './admin.guard.js';
import { AuditService } from './audit.service.js';
import { requireCsrf } from '../auth/auth.guard.js';
import { adminUserListQuerySchema, adminUserParamsSchema, updateAdminUserSchema } from './user-management.schemas.js';
import { AdminUserManagementService } from './user-management.service.js';

export async function adminUserManagementRoutes(app: FastifyInstance): Promise<void> {
  const service = new AdminUserManagementService(app.prisma);
  const audit = new AuditService(app.prisma);
  const adminOnly = async (request: Parameters<typeof requireAdminPermission>[1]) => requireAdminPermission(app, request, 'ADMIN_MANAGE');

  app.get('/admin/users', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], summary: 'List administrative users', security: [{ cookieAuth: [] }] } }, async (request) => {
    await adminOnly(request);
    const input = adminUserListQuerySchema.parse(request.query);
    return service.list(input.page, input.limit, input.search);
  });

  app.get('/admin/users/:userId', { schema: { tags: ['Administration'], summary: 'Get administrative user details', security: [{ cookieAuth: [] }] } }, async (request) => {
    await adminOnly(request);
    return { data: await service.get(adminUserParamsSchema.parse(request.params).userId) };
  });

  app.patch('/admin/users/:userId', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], summary: 'Update administrative role or status', security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request) => {
    const { auth, user, csrfTokenHash } = await adminOnly(request);
    requireCsrf(auth, csrfTokenHash, request);
    const targetId = adminUserParamsSchema.parse(request.params).userId;
    const input = updateAdminUserSchema.parse(request.body);
    const updated = await service.update(targetId, input);
    await audit.record(user.id, 'ADMIN_USER_UPDATED', 'User', request, targetId, { changedFields: Object.keys(input) });
    return { data: updated };
  });
}
