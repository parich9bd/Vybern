import type { FastifyInstance } from 'fastify';
import { requireAdminPermission } from './admin.guard.js';
import { requireCsrf } from '../auth/auth.guard.js';
import { AuditService } from './audit.service.js';
import { CatalogAdminService } from './catalog.service.js';
import { createCategorySchema, createProductSchema, createVariantSchema, inventoryAdjustSchema, paramsSchema, updateCategorySchema, updateProductSchema, updateVariantSchema, variantParamsSchema } from './catalog.schemas.js';

export async function catalogAdminRoutes(app: FastifyInstance): Promise<void> {
  const catalog = new CatalogAdminService(app.prisma);
  const audit = new AuditService(app.prisma);

  app.get('/admin/categories', { schema: { tags: ['Administration'], security: [{ cookieAuth: [] }] } }, async (request) => {
    await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    const data = await app.prisma.category.findMany({ include: { translations: { orderBy: { locale: 'asc' } }, _count: { select: { products: true } } }, orderBy: [{ position: 'asc' }, { createdAt: 'desc' }], take: 200 });
    return { data: data.map(({ _count, ...category }) => ({ ...category, productCount: _count.products })) };
  });

  app.get('/admin/products', { schema: { tags: ['Administration'], security: [{ cookieAuth: [] }] } }, async (request) => {
    await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    const data = await app.prisma.product.findMany({ include: { category: { select: { id: true, slug: true, translations: { select: { locale: true, name: true } } } }, translations: { select: { locale: true, name: true } }, variants: { select: { id: true, sku: true, stockOnHand: true, stockReserved: true, isActive: true } }, _count: { select: { images: true } } }, orderBy: { updatedAt: 'desc' }, take: 200 });
    return { data: data.map(({ _count, ...product }) => ({ ...product, imageCount: _count.images, variants: product.variants.map((variant) => ({ ...variant, availableQuantity: variant.stockOnHand - variant.stockReserved })) })) };
  });

  app.post('/admin/categories', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const category = await catalog.createCategory(createCategorySchema.parse(request.body));
    await audit.record(user.id, 'CATEGORY_CREATED', 'Category', request, category.id);
    return reply.status(201).send({ data: category });
  });

  app.patch('/admin/categories/:id', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { id } = paramsSchema.parse(request.params);
    const category = await catalog.updateCategory(id, updateCategorySchema.parse(request.body));
    await audit.record(user.id, 'CATEGORY_UPDATED', 'Category', request, id);
    return { data: category };
  });

  app.post('/admin/products', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const product = await catalog.createProduct(createProductSchema.parse(request.body));
    await audit.record(user.id, 'PRODUCT_CREATED', 'Product', request, product.id);
    return reply.status(201).send({ data: product });
  });

  app.patch('/admin/products/:id', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { id } = paramsSchema.parse(request.params);
    const product = await catalog.updateProduct(id, updateProductSchema.parse(request.body));
    await audit.record(user.id, 'PRODUCT_UPDATED', 'Product', request, id);
    return { data: product };
  });

  for (const [suffix, status, action] of [['publish', 'ACTIVE', 'PRODUCT_PUBLISHED'], ['unpublish', 'DRAFT', 'PRODUCT_UNPUBLISHED'], ['archive', 'ARCHIVED', 'PRODUCT_ARCHIVED']] as const) {
    app.post(`/admin/products/:id/${suffix}`, { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request) => {
      const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
      requireCsrf(auth, csrfTokenHash, request);
      const { id } = paramsSchema.parse(request.params);
      const product = await catalog.setProductStatus(id, status);
      await audit.record(user.id, action, 'Product', request, id);
      return { data: product };
    });
  }

  app.post('/admin/products/:id/variants', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { id } = paramsSchema.parse(request.params);
    const variant = await catalog.createVariant(id, createVariantSchema.parse(request.body));
    await audit.record(user.id, 'PRODUCT_VARIANT_CREATED', 'ProductVariant', request, variant.id, { productId: id });
    return reply.status(201).send({ data: variant });
  });

  app.patch('/admin/variants/:variantId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { variantId } = variantParamsSchema.parse(request.params);
    const variant = await catalog.updateVariant(variantId, updateVariantSchema.parse(request.body));
    await audit.record(user.id, 'PRODUCT_VARIANT_UPDATED', 'ProductVariant', request, variantId);
    return { data: variant };
  });

  app.get('/admin/inventory', { schema: { tags: ['Administration'], security: [{ cookieAuth: [] }] } }, async (request) => {
    await requireAdminPermission(app, request, 'INVENTORY_MANAGE');
    const data = await app.prisma.productVariant.findMany({ include: { product: { select: { id: true, slug: true, status: true } } }, orderBy: { updatedAt: 'desc' }, take: 200 });
    return { data: data.map((variant) => ({ ...variant, availableQuantity: variant.stockOnHand - variant.stockReserved })) };
  });

  app.post('/admin/inventory/:variantId/adjust', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'INVENTORY_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { variantId } = variantParamsSchema.parse(request.params);
    const result = await catalog.adjustInventory(variantId, user.id, inventoryAdjustSchema.parse(request.body));
    await audit.record(user.id, 'INVENTORY_ADJUSTED', 'ProductVariant', request, variantId, { quantityDelta: inventoryAdjustSchema.parse(request.body).quantityDelta });
    return { data: result };
  });

  app.get('/admin/inventory/:variantId/movements', { schema: { tags: ['Administration'], security: [{ cookieAuth: [] }] } }, async (request) => {
    await requireAdminPermission(app, request, 'INVENTORY_MANAGE');
    const { variantId } = variantParamsSchema.parse(request.params);
    const data = await app.prisma.inventoryMovement.findMany({ where: { variantId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { data };
  });
}
