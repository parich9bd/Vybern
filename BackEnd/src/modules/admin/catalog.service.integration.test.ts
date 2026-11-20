import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, ProductStatus, UserRole } from '@prisma/client';
import { CatalogAdminService } from './catalog.service.js';

const prisma = new PrismaClient();
const suffix = `catalog_test_${Date.now()}`;
let actorId: string;
let categoryId: string;
let productId: string;
let variantId: string;
const service = new CatalogAdminService(prisma);

describe('Catalog and inventory administration integration', () => {
  beforeAll(async () => {
    actorId = (await prisma.user.create({ data: { phone: `+4477${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`, role: UserRole.STAFF } })).id;
  });

  afterAll(async () => {
    if (variantId) await prisma.inventoryMovement.deleteMany({ where: { variantId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('creates, translates, publishes and archives a product without deletion', async () => {
    const category = await service.createCategory({ slug: `${suffix}-category`, position: 1, translations: [{ locale: 'en', name: 'Admin test category' }] });
    categoryId = category.id;
    const product = await service.createProduct({
      slug: `${suffix}-product`, sku: `${suffix}-sku`, categoryId, basePriceMinor: 250000, currency: 'IRR',
      specifications: { frameMaterial: 'acetate' },
      translations: [{ locale: 'en', name: 'Admin test frame', description: 'A test frame' }, { locale: 'fa', name: 'فریم آزمایشی' }],
    });
    productId = product.id;
    expect(product.status).toBe(ProductStatus.DRAFT);
    const published = await service.setProductStatus(productId, ProductStatus.ACTIVE);
    expect(published.status).toBe(ProductStatus.ACTIVE);
    const updated = await service.updateProduct(productId, { basePriceMinor: 275000, translations: [{ locale: 'de', name: 'Testgestell' }, { locale: 'en', name: 'Updated test frame' }] });
    expect(updated.basePriceMinor).toBe(275000);
    expect((await service.setProductStatus(productId, ProductStatus.ARCHIVED)).status).toBe(ProductStatus.ARCHIVED);
  });

  it('manages variants and records transaction-safe inventory adjustments', async () => {
    const variant = await service.createVariant(productId, { sku: `${suffix}-variant`, name: 'Noir / 52', colour: 'Noir', stockOnHand: 5 });
    variantId = variant.id;
    await service.updateVariant(variantId, { priceMinor: 280000, isActive: true });
    const receipt = await service.adjustInventory(variantId, actorId, { type: 'RECEIPT', quantityDelta: 4, reason: 'Initial stock receipt' });
    expect(receipt).toMatchObject({ stockOnHand: 9, availableQuantity: 9 });
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockReserved: 7 } });
    await expect(service.adjustInventory(variantId, actorId, { type: 'DAMAGE', quantityDelta: -3, reason: 'Damaged in transit' })).rejects.toMatchObject({ code: 'INVENTORY_ADJUSTMENT_REJECTED' });
    const adjustment = await service.adjustInventory(variantId, actorId, { type: 'DAMAGE', quantityDelta: -2, reason: 'Damaged in transit' });
    expect(adjustment).toMatchObject({ stockOnHand: 7, stockReserved: 7, availableQuantity: 0 });
    const movements = await prisma.inventoryMovement.findMany({ where: { variantId }, orderBy: { createdAt: 'asc' } });
    expect(movements).toHaveLength(2);
    expect(movements.map((movement) => movement.quantityDelta)).toEqual([4, -2]);
  });
});
