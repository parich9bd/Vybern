import type { FastifyInstance } from 'fastify';
import { requireAdminPermission } from '../admin/admin.guard.js';
import { AuditService } from '../admin/audit.service.js';
import { requireCsrf } from '../auth/auth.guard.js';
import { AppError } from '../../lib/errors.js';
import { updateStoreSettingsSchema } from './settings.schemas.js';

const settingsSelect = {
  storeName: true,
  storeDescription: true,
  contactEmail: true,
  contactPhone: true,
  supportInfo: true,
  supportedLanguages: true,
  defaultLanguage: true,
  defaultCurrency: true,
  maintenanceMode: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
} as const;

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const audit = new AuditService(app.prisma);

  app.get('/settings', { schema: { tags: ['Store'], summary: 'Get public store settings' } }, async () => {
    const settings = await app.prisma.storeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, storeName: 'VYBERN EYEWEAR' },
      update: {},
      select: settingsSelect,
    });
    return { data: settings };
  });

  app.get('/admin/settings', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { tags: ['Administration'], summary: 'Get store settings', security: [{ cookieAuth: [] }] },
  }, async (request) => {
    await requireAdminPermission(app, request, 'SETTINGS_MANAGE');
    return { data: await app.prisma.storeSettings.upsert({ where: { id: 1 }, create: { id: 1, storeName: 'VYBERN EYEWEAR' }, update: {}, select: settingsSelect }) };
  });

  app.patch('/admin/settings', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: { tags: ['Administration'], summary: 'Update store settings', security: [{ cookieAuth: [] }, { csrfToken: [] }] },
  }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'SETTINGS_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const input = updateStoreSettingsSchema.parse(request.body);
    const existing = await app.prisma.storeSettings.upsert({ where: { id: 1 }, create: { id: 1, storeName: 'VYBERN EYEWEAR' }, update: {} });
    const languages = input.supportedLanguages ?? existing.supportedLanguages;
    const defaultLanguage = input.defaultLanguage ?? existing.defaultLanguage;
    if (!languages.includes(defaultLanguage)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Default language must be supported');
    }
    const updated = await app.prisma.storeSettings.update({ where: { id: 1 }, data: input, select: settingsSelect });
    await audit.record(user.id, 'STORE_SETTINGS_UPDATED', 'StoreSettings', request, '1', { changedFields: Object.keys(input) });
    return { data: updated };
  });
}
