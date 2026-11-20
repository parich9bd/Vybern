import 'dotenv/config';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatus, PaymentStatus, PrismaClient, ProductStatus } from '@prisma/client';
import { CartService } from '../cart/cart.service.js';
import { OrderService } from '../orders/order.service.js';
import { MockPaymentProvider } from './payment.provider.js';
import { PaymentService } from './payment.service.js';

const prisma = new PrismaClient();
const suffix = `payment_test_${Date.now()}`;
const shippingAddress = { firstName: 'Test', lastName: 'Buyer', phone: '+989121234567', addressLine1: '1 Test Street', city: 'Isfahan', region: 'Isfahan', postalCode: '1234567890', countryCode: 'IR' };
let categoryId: string;
let productId: string;
let variantId: string;
let shippingRateId: string;
let users: string[] = [];

async function createUser(): Promise<string> {
  const user = await prisma.user.create({ data: { phone: `+4477${Math.floor(Math.random() * 9_000_000 + 1_000_000)}` } });
  users.push(user.id);
  return user.id;
}

async function createPendingOrder(userId: string, quantity = 1) {
  await new CartService(prisma).add(userId, variantId, quantity, 'en');
  return new OrderService(prisma).checkout(userId, `${suffix}-${userId}-${Date.now()}`, shippingAddress);
}

describe('PaymentService database integration', () => {
  beforeAll(async () => {
    const category = await prisma.category.create({ data: { slug: `${suffix}-category`, translations: { create: { locale: 'en', name: 'Payment test category' } } } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${suffix}-product`, sku: `${suffix}-sku`, categoryId, status: ProductStatus.ACTIVE, basePriceMinor: 30000, currency: 'IRR',
        translations: { create: { locale: 'en', name: 'Payment test frame' } },
        variants: { create: { sku: `${suffix}-variant`, name: 'Payment variant', stockOnHand: 5 } },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0].id;
    shippingRateId = (await prisma.shippingRate.upsert({
      where: { province: 'Isfahan' },
      create: { province: 'Isfahan', method: 'Test standard', priceMinor: 1_000, estimatedDays: 2 },
      update: { method: 'Test standard', priceMinor: 1_000, estimatedDays: 2, isActive: true },
    })).id;
  });

  beforeEach(async () => {
    users = [];
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockOnHand: 5, stockReserved: 0, isActive: true, priceMinor: null } });
  });

  afterEach(async () => {
    if (users.length > 0) {
      await prisma.paymentAttempt.deleteMany({ where: { payment: { order: { userId: { in: users } } } } });
      await prisma.payment.deleteMany({ where: { order: { userId: { in: users } } } });
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

  it('settles a successful mock payment atomically', async () => {
    const userId = await createUser();
    const order = await createPendingOrder(userId, 2);
    const service = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await service.initiate(userId, order.data.id);
    const settled = await service.mockAction(userId, payment.data.id, 'success');
    expect(settled.data.status).toBe(PaymentStatus.SUCCEEDED);
    expect((await new OrderService(prisma).getById(userId, order.data.id)).data.status).toBe(OrderStatus.PAID);
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stockOnHand: 3, stockReserved: 0 });
  });

  it('records failed and cancelled mock payments without marking an order paid', async () => {
    const failedUser = await createUser();
    const failedOrder = await createPendingOrder(failedUser);
    const service = new PaymentService(prisma, new MockPaymentProvider(), true);
    const failedPayment = await service.initiate(failedUser, failedOrder.data.id);
    expect((await service.mockAction(failedUser, failedPayment.data.id, 'fail')).data.status).toBe(PaymentStatus.FAILED);
    expect((await new OrderService(prisma).getById(failedUser, failedOrder.data.id)).data.status).toBe(OrderStatus.PENDING_PAYMENT);

    const cancelledUser = await createUser();
    const cancelledOrder = await createPendingOrder(cancelledUser);
    const cancelledPayment = await service.initiate(cancelledUser, cancelledOrder.data.id);
    expect((await service.mockAction(cancelledUser, cancelledPayment.data.id, 'cancel')).data.status).toBe(PaymentStatus.CANCELLED);
    expect((await new OrderService(prisma).getById(cancelledUser, cancelledOrder.data.id)).data.status).toBe(OrderStatus.CANCELLED);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(1);
  });

  it('is idempotent for duplicate and concurrent settlement', async () => {
    const userId = await createUser();
    const order = await createPendingOrder(userId);
    const service = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await service.initiate(userId, order.data.id);
    const results = await Promise.all([service.mockAction(userId, payment.data.id, 'success'), service.mockAction(userId, payment.data.id, 'success')]);
    expect(results.map((result) => result.data.status)).toEqual([PaymentStatus.SUCCEEDED, PaymentStatus.SUCCEEDED]);
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stockOnHand: 4, stockReserved: 0 });
  });

  it('rejects cross-user access and payment amount corruption', async () => {
    const userId = await createUser();
    const otherUserId = await createUser();
    const order = await createPendingOrder(userId);
    const service = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await service.initiate(userId, order.data.id);
    await expect(service.get(otherUserId, payment.data.id)).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
    await expect(service.mockAction(otherUserId, payment.data.id, 'success')).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
    await prisma.payment.update({ where: { id: payment.data.id }, data: { amountMinor: 1 } });
    await expect(service.mockAction(userId, payment.data.id, 'success')).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect((await new OrderService(prisma).getById(userId, order.data.id)).data.status).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it('expires and releases reservations through a fresh service instance after restart', async () => {
    const userId = await createUser();
    const order = await createPendingOrder(userId);
    const service = new PaymentService(prisma, new MockPaymentProvider(), true);
    await service.initiate(userId, order.data.id);
    await prisma.order.update({ where: { id: order.data.id }, data: { reservationExpiresAt: new Date(Date.now() - 1_000) } });
    await new OrderService(prisma).expirePendingOrders();
    expect((await new OrderService(prisma).getById(userId, order.data.id)).data.status).toBe(OrderStatus.EXPIRED);
    expect((await service.get(userId, (await prisma.payment.findUniqueOrThrow({ where: { orderId: order.data.id } })).id)).data.status).toBe(PaymentStatus.EXPIRED);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(0);
  });

  it('does not let expiration and settlement both succeed', async () => {
    const userId = await createUser();
    const order = await createPendingOrder(userId);
    const service = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await service.initiate(userId, order.data.id);
    await prisma.order.update({ where: { id: order.data.id }, data: { reservationExpiresAt: new Date(Date.now() - 1_000) } });
    const results = await Promise.allSettled([service.mockAction(userId, payment.data.id, 'success'), new OrderService(prisma).expirePendingOrders()]);
    expect(results.some((result) => result.status === 'rejected')).toBe(true);
    expect((await new OrderService(prisma).getById(userId, order.data.id)).data.status).toBe(OrderStatus.EXPIRED);
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).toMatchObject({ stockOnHand: 5, stockReserved: 0 });
  });

  it('rejects mock actions outside development', async () => {
    const userId = await createUser();
    const order = await createPendingOrder(userId);
    const development = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await development.initiate(userId, order.data.id);
    const production = new PaymentService(prisma, new MockPaymentProvider(), false);
    await expect(production.mockAction(userId, payment.data.id, 'success')).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
  });
});
