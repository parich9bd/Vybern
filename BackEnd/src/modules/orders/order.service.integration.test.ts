import 'dotenv/config';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatus, PrismaClient, ProductStatus } from '@prisma/client';
import { CartService } from '../cart/cart.service.js';
import { OrderService } from './order.service.js';

const prisma = new PrismaClient();
const suffix = `order_test_${Date.now()}`;
const shippingAddress = { firstName: 'Test', lastName: 'Buyer', phone: '+989121234567', addressLine1: '1 Test Street', city: 'Karaj', region: 'Alborz', postalCode: '1234567890', countryCode: 'IR' };
let categoryId: string;
let productId: string;
let variantId: string;
let lowStockVariantId: string;
let shippingRateId: string;
let users: string[] = [];

async function createUser(): Promise<string> {
  const user = await prisma.user.create({ data: { phone: `+4477${Math.floor(Math.random() * 9_000_000 + 1_000_000)}` } });
  users.push(user.id);
  return user.id;
}

async function addToCart(userId: string, requestedVariantId: string, quantity: number): Promise<void> {
  await new CartService(prisma).add(userId, requestedVariantId, quantity, 'en');
}

describe('OrderService database integration', () => {
  beforeAll(async () => {
    const category = await prisma.category.create({ data: { slug: `${suffix}-category`, translations: { create: { locale: 'en', name: 'Order test category' } } } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${suffix}-product`, sku: `${suffix}-sku`, categoryId, status: ProductStatus.ACTIVE, basePriceMinor: 25000, currency: 'IRR',
        translations: { create: { locale: 'en', name: 'Snapshot frame' } },
        variants: { create: [
          { sku: `${suffix}-main`, name: 'Main frame', colour: 'Black', stockOnHand: 5 },
          { sku: `${suffix}-low`, name: 'Low frame', colour: 'Gold', stockOnHand: 1 },
        ] },
      },
      include: { variants: { orderBy: { name: 'asc' } } },
    });
    productId = product.id;
    lowStockVariantId = product.variants[0].id;
    variantId = product.variants[1].id;
    shippingRateId = (await prisma.shippingRate.upsert({
      where: { province: 'Alborz' },
      create: { province: 'Alborz', method: 'Test standard', priceMinor: 1_000, estimatedDays: 2 },
      update: { method: 'Test standard', priceMinor: 1_000, estimatedDays: 2, isActive: true },
    })).id;
  });

  beforeEach(async () => {
    users = [];
    await prisma.product.update({ where: { id: productId }, data: { status: ProductStatus.ACTIVE, basePriceMinor: 25000, currency: 'IRR' } });
    await prisma.productVariant.updateMany({ where: { productId }, data: { stockOnHand: 5, stockReserved: 0, isActive: true, priceMinor: null } });
    await prisma.productVariant.update({ where: { id: lowStockVariantId }, data: { stockOnHand: 1, stockReserved: 0 } });
  });

  afterEach(async () => {
    if (users.length > 0) {
      await prisma.order.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
  });

  afterAll(async () => {
    await prisma.product.delete({ where: { id: productId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.shippingRate.deleteMany({ where: { id: shippingRateId } });
    await prisma.$disconnect();
  });

  it('rejects checkout for an empty cart', async () => {
    const userId = await createUser();
    await expect(new OrderService(prisma).checkout(userId, `${suffix}-empty-key`, shippingAddress)).rejects.toMatchObject({ code: 'CART_EMPTY' });
  });

  it('creates an immutable order price snapshot, clears the cart and reserves inventory', async () => {
    const userId = await createUser();
    await addToCart(userId, variantId, 2);
    const orders = new OrderService(prisma);
    const order = await orders.checkout(userId, `${suffix}-create-key`, shippingAddress);
    expect(order.data).toMatchObject({ status: OrderStatus.PENDING_PAYMENT, currency: 'IRR', subtotal: { amountMinor: 50000 }, shipping: { amountMinor: 1_000 }, total: { amountMinor: 51000 } });
    expect(order.data.items[0]).toMatchObject({ quantity: 2, unitPrice: { amountMinor: 25000 }, lineTotal: { amountMinor: 50000 }, product: { name: 'Snapshot frame' } });
    expect((await new CartService(prisma).get(userId, 'en')).data.items).toHaveLength(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(2);
    await prisma.product.update({ where: { id: productId }, data: { basePriceMinor: 99999 } });
    expect((await orders.getById(userId, order.data.id)).data.items[0].unitPrice.amountMinor).toBe(25000);
  });

  it('returns the same order for a duplicate idempotency key without reserving stock twice', async () => {
    const userId = await createUser();
    await addToCart(userId, variantId, 1);
    const service = new OrderService(prisma);
    const key = `${suffix}-idempotency-key`;
    const first = await service.checkout(userId, key, shippingAddress);
    const second = await service.checkout(userId, key, shippingAddress);
    expect(second.data.id).toBe(first.data.id);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(1);
    expect(await prisma.order.count({ where: { userId } })).toBe(1);
  });

  it('rejects unavailable products and insufficient inventory', async () => {
    const userId = await createUser();
    await addToCart(userId, variantId, 1);
    await prisma.product.update({ where: { id: productId }, data: { status: ProductStatus.ARCHIVED } });
    await expect(new OrderService(prisma).checkout(userId, `${suffix}-archived-key`, shippingAddress)).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    await prisma.product.update({ where: { id: productId }, data: { status: ProductStatus.ACTIVE } });
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockReserved: 5 } });
    await expect(new OrderService(prisma).checkout(userId, `${suffix}-stock-key`, shippingAddress)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('rolls back reservations when another item makes checkout fail', async () => {
    const userId = await createUser();
    await addToCart(userId, variantId, 1);
    await prisma.cartItem.create({ data: { cartId: (await prisma.cart.findUniqueOrThrow({ where: { userId } })).id, variantId: lowStockVariantId, quantity: 1 } });
    await prisma.productVariant.update({ where: { id: lowStockVariantId }, data: { stockReserved: 1 } });
    await expect(new OrderService(prisma).checkout(userId, `${suffix}-rollback-key`, shippingAddress)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(0);
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
  });

  it('prevents overselling under concurrent checkouts', async () => {
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockOnHand: 3 } });
    const firstUser = await createUser();
    const secondUser = await createUser();
    await Promise.all([addToCart(firstUser, variantId, 2), addToCart(secondUser, variantId, 2)]);
    const service = new OrderService(prisma);
    const results = await Promise.allSettled([
      service.checkout(firstUser, `${suffix}-concurrent-one`, shippingAddress),
      service.checkout(secondUser, `${suffix}-concurrent-two`, shippingAddress),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(2);
  });

  it('enforces order ownership and lazily releases expired reservations', async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    await addToCart(userId, variantId, 1);
    const service = new OrderService(prisma);
    const order = await service.checkout(userId, `${suffix}-ownership-key`, shippingAddress);
    await expect(service.getById(otherUserId, order.data.id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    await prisma.order.update({ where: { id: order.data.id }, data: { reservationExpiresAt: new Date(Date.now() - 1_000) } });
    const expired = await service.getById(userId, order.data.id);
    expect(expired.data.status).toBe(OrderStatus.EXPIRED);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(0);
  });
});
