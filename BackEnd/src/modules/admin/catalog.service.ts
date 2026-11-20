import { InventoryMovementType, Prisma, PrismaClient, ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { z } from 'zod';
import type { createCategorySchema, createProductSchema, createVariantSchema, inventoryAdjustSchema, updateCategorySchema, updateProductSchema, updateVariantSchema } from './catalog.schemas.js';

type CreateProduct = z.infer<typeof createProductSchema>;
type UpdateProduct = z.infer<typeof updateProductSchema>;
type CreateVariant = z.infer<typeof createVariantSchema>;
type UpdateVariant = z.infer<typeof updateVariantSchema>;

export class CatalogAdminService {
  constructor(private readonly prisma: PrismaClient) {}

  async createCategory(input: z.infer<typeof createCategorySchema>) {
    return this.prisma.category.create({ data: { slug: input.slug, position: input.position, translations: { create: input.translations } } });
  }

  async updateCategory(id: string, input: z.infer<typeof updateCategorySchema>) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    return this.prisma.$transaction(async (tx) => {
      if (input.translations) await tx.categoryTranslation.deleteMany({ where: { categoryId: id } });
      return tx.category.update({ data: { ...(input.slug ? { slug: input.slug } : {}), ...(input.position === undefined ? {} : { position: input.position }), ...(input.translations ? { translations: { create: input.translations } } : {}) }, where: { id } });
    });
  }

  async createProduct(input: CreateProduct) {
    const category = await this.prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    return this.prisma.product.create({ data: { slug: input.slug, sku: input.sku, categoryId: input.categoryId, basePriceMinor: input.basePriceMinor, currency: input.currency, isFeatured: input.isFeatured ?? false, specifications: input.specifications as Prisma.InputJsonValue | undefined, translations: { create: input.translations } } });
  }

  async updateProduct(id: string, input: UpdateProduct) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
      if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.translations) await tx.productTranslation.deleteMany({ where: { productId: id } });
      return tx.product.update({
        where: { id },
        data: {
          ...(input.slug ? { slug: input.slug } : {}), ...(input.sku ? { sku: input.sku } : {}), ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.basePriceMinor === undefined ? {} : { basePriceMinor: input.basePriceMinor }), ...(input.currency ? { currency: input.currency } : {}),
          ...(input.isFeatured === undefined ? {} : { isFeatured: input.isFeatured }), ...(input.specifications === undefined ? {} : { specifications: input.specifications as Prisma.InputJsonValue }),
          ...(input.translations ? { translations: { create: input.translations } } : {}),
        },
      });
    });
  }

  async setProductStatus(id: string, status: ProductStatus) {
    const result = await this.prisma.product.updateMany({ where: { id }, data: { status } });
    if (result.count !== 1) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    return this.prisma.product.findUniqueOrThrow({ where: { id } });
  }

  async createVariant(productId: string, input: CreateVariant) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    return this.prisma.productVariant.create({ data: { productId, ...input, isActive: input.isActive ?? true } });
  }

  async updateVariant(variantId: string, input: UpdateVariant) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
    return this.prisma.productVariant.update({ where: { id: variantId }, data: input });
  }

  async adjustInventory(variantId: string, actorUserId: string, input: z.infer<typeof inventoryAdjustSchema>) {
    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true, stockOnHand: true } });
      if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
      const changed = await tx.$executeRaw`
        UPDATE "ProductVariant" SET "stockOnHand" = "stockOnHand" + ${input.quantityDelta}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${variantId} AND "stockOnHand" + ${input.quantityDelta} >= "stockReserved" AND "stockOnHand" + ${input.quantityDelta} >= 0
      `;
      if (changed !== 1) throw new AppError(409, 'INVENTORY_ADJUSTMENT_REJECTED', 'Adjustment would violate reserved inventory');
      const after = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stockOnHand: true, stockReserved: true } });
      await tx.inventoryMovement.create({ data: { variantId, actorUserId, type: input.type as InventoryMovementType, quantityDelta: input.quantityDelta, stockBefore: variant.stockOnHand, stockAfter: after.stockOnHand, reason: input.reason, note: input.note } });
      return { stockOnHand: after.stockOnHand, stockReserved: after.stockReserved, availableQuantity: after.stockOnHand - after.stockReserved };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
