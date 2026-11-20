import { basename } from 'node:path';
import type { FastifyInstance, FastifySchema } from 'fastify';
import { requireCsrf } from '../auth/auth.guard.js';
import { requireAdminPermission } from '../admin/admin.guard.js';
import { AuditService } from '../admin/audit.service.js';
import { AppError } from '../../lib/errors.js';
import { assignMediaSchema, mediaListQuerySchema, mediaMetadataSchema, mediaParamsSchema, productMediaParamsSchema, productParamsSchema, reorderImagesSchema } from './media.schemas.js';
import { MediaService } from './media.service.js';

function safeOriginalName(filename: string): string {
  return basename(filename.replace(/\0/g, '')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 255) || 'upload';
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const service = new MediaService(app.prisma, app.mediaStorage, app.environment.MEDIA_MAX_FILE_SIZE_BYTES);
  const audit = new AuditService(app.prisma);
  const readSchema: FastifySchema = { tags: ['Media'], security: [{ cookieAuth: [] }] };
  const writeSchema: FastifySchema = { tags: ['Media'], security: [{ cookieAuth: [] }, { csrfToken: [] }] };

  app.post('/admin/media', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { ...writeSchema, summary: 'Upload an image asset' } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const file = await request.file({ limits: { files: 1, fileSize: app.environment.MEDIA_MAX_FILE_SIZE_BYTES } });
    if (!file || file.fieldname !== 'file') throw new AppError(400, 'INVALID_MEDIA_UPLOAD', 'A single file field is required');
    let contents: Buffer;
    try {
      contents = await file.toBuffer();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'statusCode' in error && (error as { statusCode?: unknown }).statusCode === 413) {
        throw new AppError(413, 'MEDIA_TOO_LARGE', 'Media exceeds the configured file size limit');
      }
      throw error;
    }
    if (file.file.truncated) throw new AppError(413, 'MEDIA_TOO_LARGE', 'Media exceeds the configured file size limit');
    const result = await service.upload(user.id, safeOriginalName(file.filename), contents);
    await audit.record(user.id, result.duplicate ? 'MEDIA_DUPLICATE_REUSED' : 'MEDIA_UPLOADED', 'MediaAsset', request, result.asset.id, { contentType: result.asset.contentType, byteSize: result.asset.byteSize });
    return reply.status(result.duplicate ? 200 : 201).send({ data: result.asset, duplicate: result.duplicate });
  });

  app.get('/admin/media', { schema: { ...readSchema, summary: 'List media library assets' } }, async (request) => {
    await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    const query = mediaListQuerySchema.parse(request.query);
    return service.list(query.page, query.limit, query.includeDeleted);
  });

  app.get('/admin/media/:mediaId', { schema: { ...readSchema, summary: 'Get media asset metadata' } }, async (request) => {
    await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    return service.get(mediaParamsSchema.parse(request.params).mediaId, true);
  });

  app.patch('/admin/media/:mediaId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { ...writeSchema, summary: 'Update media alt text' } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { mediaId } = mediaParamsSchema.parse(request.params);
    const { altText } = mediaMetadataSchema.parse(request.body);
    const result = await service.updateMetadata(mediaId, altText);
    await audit.record(user.id, 'MEDIA_METADATA_UPDATED', 'MediaAsset', request, mediaId);
    return result;
  });

  app.post('/admin/products/:productId/images', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { ...writeSchema, summary: 'Assign media to a product' } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { productId } = productParamsSchema.parse(request.params);
    const { mediaAssetId } = assignMediaSchema.parse(request.body);
    const image = await service.assignToProduct(productId, mediaAssetId);
    await audit.record(user.id, 'PRODUCT_MEDIA_ASSIGNED', 'ProductImage', request, image.id, { productId, mediaAssetId });
    return reply.status(201).send({ data: image });
  });

  app.patch('/admin/products/:productId/images/order', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { ...writeSchema, summary: 'Reorder product images; first is primary' } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { productId } = productParamsSchema.parse(request.params);
    const { imageIds } = reorderImagesSchema.parse(request.body);
    const images = await service.reorderProductImages(productId, imageIds);
    await audit.record(user.id, 'PRODUCT_MEDIA_REORDERED', 'Product', request, productId, { imageCount: imageIds.length });
    return { data: images };
  });

  app.delete('/admin/products/:productId/images/:imageId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { ...writeSchema, summary: 'Remove a media reference from a product' } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { productId, imageId } = productMediaParamsSchema.parse(request.params);
    await service.removeProductReference(productId, imageId);
    await audit.record(user.id, 'PRODUCT_MEDIA_REMOVED', 'ProductImage', request, imageId, { productId });
    return reply.status(204).send();
  });

  app.delete('/admin/media/:mediaId', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { ...writeSchema, summary: 'Soft-delete an unused media asset' } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'PRODUCT_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { mediaId } = mediaParamsSchema.parse(request.params);
    await service.softDelete(mediaId);
    await audit.record(user.id, 'MEDIA_SOFT_DELETED', 'MediaAsset', request, mediaId);
    return reply.status(204).send();
  });

  app.post('/admin/media/cleanup', { config: { rateLimit: { max: 2, timeWindow: '1 hour' } }, schema: { ...writeSchema, summary: 'Purge media soft-deleted for at least 30 days' } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'ADMIN_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const purged = await service.purgeDeleted();
    await audit.record(user.id, 'MEDIA_PURGED', 'MediaAsset', request, undefined, { purged });
    return { data: { purged } };
  });

  app.get('/media/:mediaId/content', { schema: { tags: ['Media'], summary: 'Serve media referenced by an active product' } }, async (request, reply) => {
    const { mediaId } = mediaParamsSchema.parse(request.params);
    const content = await service.contentForPublicProduct(mediaId);
    return reply.type(content.contentType).header('cache-control', 'public, max-age=3600').send(content.contents);
  });
}
