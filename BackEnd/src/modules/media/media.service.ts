import { createHash } from 'node:crypto';
import { Prisma, PrismaClient, ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { MediaStorage } from './media.storage.js';

type DetectedImage = { contentType: 'image/jpeg' | 'image/png' | 'image/webp'; extension: 'jpg' | 'png' | 'webp' };

export function detectImage(contents: Buffer): DetectedImage {
  if (contents.length < 12) throw new AppError(400, 'INVALID_MEDIA_CONTENT', 'Unsupported or invalid image content');
  if (contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && contents.subarray(12, 16).toString('ascii') === 'IHDR') return { contentType: 'image/png', extension: 'png' };
  if (contents[0] === 0xff && contents[1] === 0xd8 && contents.includes(Buffer.from([0xff, 0xd9]))) return { contentType: 'image/jpeg', extension: 'jpg' };
  if (contents.subarray(0, 4).toString('ascii') === 'RIFF' && contents.subarray(8, 12).toString('ascii') === 'WEBP') return { contentType: 'image/webp', extension: 'webp' };
  throw new AppError(400, 'INVALID_MEDIA_CONTENT', 'Unsupported or invalid image content');
}

function serialise(asset: { id: string; storageKey: string; originalName: string; contentType: string; byteSize: number; altTextEn: string | null; altTextFa: string | null; altTextDe: string | null; deletedAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: asset.id, url: `/api/v1/media/${asset.id}/content`, originalName: asset.originalName, contentType: asset.contentType, byteSize: asset.byteSize, altText: { en: asset.altTextEn, fa: asset.altTextFa, de: asset.altTextDe }, deletedAt: asset.deletedAt?.toISOString() ?? null, createdAt: asset.createdAt.toISOString(), updatedAt: asset.updatedAt.toISOString() };
}

export class MediaService {
  constructor(private readonly prisma: PrismaClient, private readonly storage: MediaStorage, private readonly maxSize: number) {}

  async upload(actorUserId: string, originalName: string, contents: Buffer) {
    if (contents.length === 0 || contents.length > this.maxSize) throw new AppError(413, 'MEDIA_TOO_LARGE', 'Media exceeds the configured file size limit');
    const detected = detectImage(contents);
    const sha256 = createHash('sha256').update(contents).digest('hex');
    const duplicate = await this.prisma.mediaAsset.findUnique({ where: { sha256 } });
    if (duplicate) {
      const asset = duplicate.deletedAt ? await this.prisma.mediaAsset.update({ where: { id: duplicate.id }, data: { deletedAt: null } }) : duplicate;
      return { asset: serialise(asset), duplicate: true };
    }
    const storageKey = this.storage.createKey(detected.extension);
    await this.storage.put(storageKey, contents);
    try {
      const asset = await this.prisma.mediaAsset.create({ data: { storageKey, sha256, originalName: originalName.slice(0, 255), contentType: detected.contentType, byteSize: contents.length, createdByUserId: actorUserId } });
      return { asset: serialise(asset), duplicate: false };
    } catch (error) {
      await this.storage.remove(storageKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.mediaAsset.findUnique({ where: { sha256 } });
        if (existing) {
          const asset = existing.deletedAt ? await this.prisma.mediaAsset.update({ where: { id: existing.id }, data: { deletedAt: null } }) : existing;
          return { asset: serialise(asset), duplicate: true };
        }
      }
      throw error;
    }
  }

  async list(page: number, limit: number, includeDeleted: boolean) {
    const where = includeDeleted ? {} : { deletedAt: null };
    const [assets, total] = await this.prisma.$transaction([this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), this.prisma.mediaAsset.count({ where })]);
    return { data: assets.map(serialise), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async get(mediaId: string, includeDeleted = false) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, ...(includeDeleted ? {} : { deletedAt: null }) } });
    if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
    return { data: serialise(asset) };
  }

  async updateMetadata(mediaId: string, altText: { en?: string; fa?: string; de?: string }) {
    const asset = await this.prisma.mediaAsset.updateMany({ where: { id: mediaId, deletedAt: null }, data: { ...(altText.en === undefined ? {} : { altTextEn: altText.en }), ...(altText.fa === undefined ? {} : { altTextFa: altText.fa }), ...(altText.de === undefined ? {} : { altTextDe: altText.de }) } });
    if (asset.count !== 1) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
    return this.get(mediaId);
  }

  async assignToProduct(productId: string, mediaAssetId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [product, asset] = await Promise.all([tx.product.findUnique({ where: { id: productId }, select: { id: true } }), tx.mediaAsset.findFirst({ where: { id: mediaAssetId, deletedAt: null } })]);
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
      const max = await tx.productImage.aggregate({ where: { productId }, _max: { position: true } });
      try {
        const image = await tx.productImage.create({ data: { productId, mediaAssetId, url: `/api/v1/media/${asset.id}/content`, alt: asset.altTextEn, position: (max._max.position ?? -1) + 1 } });
        return { id: image.id, mediaAssetId: asset.id, url: image.url, altText: { en: asset.altTextEn, fa: asset.altTextFa, de: asset.altTextDe }, position: image.position };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'MEDIA_ALREADY_ASSIGNED', 'Media is already assigned to this product');
        throw error;
      }
    });
  }

  async reorderProductImages(productId: string, imageIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const images = await tx.productImage.findMany({ where: { productId }, select: { id: true } });
      if (images.length !== imageIds.length || images.some((image) => !imageIds.includes(image.id))) throw new AppError(400, 'INVALID_PRODUCT_IMAGE_ORDER', 'Image order must include every product image exactly once');
      await tx.productImage.updateMany({ where: { productId }, data: { position: { increment: 10_000 } } });
      await Promise.all(imageIds.map((id, position) => tx.productImage.update({ where: { id }, data: { position } })));
      return tx.productImage.findMany({ where: { productId }, orderBy: { position: 'asc' } });
    });
  }

  async removeProductReference(productId: string, imageId: string) {
    const removed = await this.prisma.productImage.deleteMany({ where: { id: imageId, productId } });
    if (removed.count !== 1) throw new AppError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'Product image not found');
    const images = await this.prisma.productImage.findMany({ where: { productId }, orderBy: { position: 'asc' } });
    await this.prisma.$transaction(images.map((image, position) => this.prisma.productImage.update({ where: { id: image.id }, data: { position } })));
  }

  async softDelete(mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, deletedAt: null }, include: { productImages: { include: { product: { select: { status: true } } } } } });
    if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
    if (asset.productImages.some((image) => image.product.status === ProductStatus.ACTIVE)) throw new AppError(409, 'MEDIA_REFERENCED_BY_ACTIVE_PRODUCT', 'Media is referenced by an active product');
    if (asset.productImages.length > 0) throw new AppError(409, 'MEDIA_IN_USE', 'Remove product references before deleting media');
    await this.prisma.mediaAsset.update({ where: { id: mediaId }, data: { deletedAt: new Date() } });
  }

  // Physical removal is deliberately delayed for 30 days after a safe soft delete.
  async purgeDeleted(retentionDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const assets = await this.prisma.mediaAsset.findMany({ where: { deletedAt: { lte: cutoff }, productImages: { none: {} } }, select: { id: true, storageKey: true } });
    for (const asset of assets) await this.storage.remove(asset.storageKey);
    const deleted = await this.prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map((asset) => asset.id) }, productImages: { none: {} } } });
    return deleted.count;
  }

  async contentForPublicProduct(mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, deletedAt: null, productImages: { some: { product: { status: ProductStatus.ACTIVE } } } } });
    if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
    return { contents: await this.storage.read(asset.storageKey), contentType: asset.contentType };
  }
}
