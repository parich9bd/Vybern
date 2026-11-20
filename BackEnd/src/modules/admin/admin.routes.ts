import type { FastifyInstance } from 'fastify';
import { requireAdminPermission } from './admin.guard.js';
import { AppError } from '../../lib/errors.js';
import { dashboardQuerySchema } from './dashboard.schemas.js';
import { DashboardService } from './dashboard.service.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const dashboard = new DashboardService(app.prisma);
  app.get('/admin/me', {
    schema: { tags: ['Administration'], summary: 'Get the authenticated administrator profile', security: [{ cookieAuth: [] }] },
  }, async (request) => {
    const { user } = await requireAdminPermission(app, request, 'DASHBOARD_READ');
    return { data: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role } };
  });

  app.get('/admin/dashboard', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { tags: ['Administration'], summary: 'Get administration dashboard metrics', security: [{ cookieAuth: [] }] },
  }, async (request) => {
    await requireAdminPermission(app, request, 'DASHBOARD_READ');
    const query = dashboardQuerySchema.parse(request.query);
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 30 * 86_400_000);
    if (from > to) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid dashboard date range');
    return dashboard.overview(from, to, query.recentLimit);
  });
}
