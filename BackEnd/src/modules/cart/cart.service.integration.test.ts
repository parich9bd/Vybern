import 'dotenv/config';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, ProductStatus } from '@prisma/client';
import { CartService } from './cart.service.js';

const prisma = new PrismaClient();
const suffix = `cart_test_${Date.now()}`;
let categoryId: string;
let variantId: string;
let lowStockVariantId: string;
let productId: string;
let userId: string;
let service: CartService;

async function createUser(): Promise<string> {
  const user = await prisma.user.create({ data: { phone: `+4477${Math.floor(Math.random() * 9_000_000 + 1_000_000)}` } });
  return user.id;
}

describe('CartService database integration', () => {
  beforeAll(async () => {
    const category = await prisma.category.create({ data: { slug: `${suffix}-category`, translations: { create: { locale: 'en', name: 'Cart test category' } } } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${suffix}-product`, sku: `${suffix}-sku`, categoryId, status: ProductStatus.ACTIVE, basePriceMinor: 12000, currency: 'EUR',
        translations: { create: { locale: 'en', name: 'Cart test frame' } },
        variants: { create: [
          { sku: `${suffix}-standard`, name: 'Standard', stockOnHand: 5 },
          { sku: `${suffix}-low`, name: 'Low stock', priceMinor: 15000, stockOnHand: 1 },
        ] },
      },
      include: { variants: { orderBy: { name: 'asc' } } },
    });
    productId = product.id;
    lowStockVariantId = product.variants[0].id;
    variantId = product.variants[1].id;
  });

  beforeEach(async () => {
    userId = await createUser();
    service = new CartService(prisma);
    await prisma.productVariant.update({ where: { id: variantId }, data: { priceMinor: null, stockOnHand: 5, stockReserved: 0, isActive: true } });
  });

  afterEach(async () => { await prisma.user.delete({ where: { id: userId } }); });
  afterAll(async () => {
    await prisma.product.delete({ where: { id: productId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('returns a persistent empty cart', async () => {
    const first = await service.get(userId, 'en');
    const second = await new CartService(prisma).get(userId, 'en');
    expect(first.data).toMatchObject({ items: [], totalItemCount: 0, currency: null });
    expect(second.data.id).toBe(first.data.id);
  });

  it('adds an item and calculates totals from server-side prices', async () => {
    const cart = await service.add(userId, variantId, 2, 'en');
    expect(cart.data).toMatchObject({ currency: 'EUR', totalItemCount: 2, subtotal: { amountMinor: 24000, currency: 'EUR' } });
    expect(cart.data.items[0]).toMatchObject({ quantity: 2, unitPrice: { amountMinor: 12000 }, lineTotal: { amountMinor: 24000 } });
  });

  it('increments quantity when the same variant is added again', async () => {
    await service.add(userId, variantId, 1, 'en');
    const cart = await service.add(userId, variantId, 2, 'en');
    expect(cart.data.items).toHaveLength(1);
    expect(cart.data.items[0].quantity).toBe(3);
  });

  it('updates, removes and clears items', async () => {
    const added = await service.add(userId, variantId, 1, 'en');
    const itemId = added.data.items[0].id;
    const updated = await service.update(userId, itemId, 4, 'en');
    expect(updated.data.items[0].quantity).toBe(4);
    const removed = await service.remove(userId, itemId, 'en');
    expect(removed.data.items).toHaveLength(0);
    await service.add(userId, variantId, 1, 'en');
    const cleared = await service.clear(userId, 'en');
    expect(cleared.data).toMatchObject({ items: [], totalItemCount: 0, currency: null });
  });

  it('rejects unavailable variants and quantities above stock', async () => {
    await expect(service.add(userId, 'missing_variant', 1, 'en')).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    await expect(service.add(userId, variantId, 6, 'en')).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    await expect(service.add(userId, lowStockVariantId, 2, 'en')).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('prevents cross-user cart item access', async () => {
    const item = (await service.add(userId, variantId, 1, 'en')).data.items[0];
    const otherUserId = await createUser();
    const otherService = new CartService(prisma);
    await expect(otherService.update(otherUserId, item.id, 2, 'en')).rejects.toMatchObject({ code: 'CART_ITEM_NOT_FOUND' });
    await expect(otherService.remove(otherUserId, item.id, 'en')).rejects.toMatchObject({ code: 'CART_ITEM_NOT_FOUND' });
    await prisma.user.delete({ where: { id: otherUserId } });
  });

  it('uses the current price when a product price changes', async () => {
    await service.add(userId, variantId, 2, 'en');
    await prisma.productVariant.update({ where: { id: variantId }, data: { priceMinor: 17500 } });
    const cart = await service.get(userId, 'en');
    expect(cart.data.items[0].lineTotal).toMatchObject({ amountMinor: 35000, currency: 'EUR' });
  });
});
