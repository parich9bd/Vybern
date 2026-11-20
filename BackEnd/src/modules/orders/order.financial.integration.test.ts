import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DiscountRedemptionStatus, DiscountType, OrderStatus, Prisma, PrismaClient, ProductStatus } from '@prisma/client';
import { CartService } from '../cart/cart.service.js';
import { DiscountService } from '../discounts/discount.service.js';
import { MockPaymentProvider } from '../payments/payment.provider.js';
import { PaymentService } from '../payments/payment.service.js';
import { createVerifiedTestPrismaClient } from '../../test/test-database.js';
import { OrderService } from './order.service.js';

const suffix = `financial_${Date.now()}`;
const shippingRateMinor = 15_000;

let prisma: PrismaClient;
let categoryId: string;
let productId: string;
let variantId: string;
let lowStockVariantId: string;
let userIds: string[] = [];
let addressIds: string[] = [];
let discountIds: string[] = [];
let rateIds: string[] = [];

const carts = () => new CartService(prisma);
const orders = () => new OrderService(prisma);

async function createUser(): Promise<string> {
  const digits = String(Date.now() + userIds.length).slice(-9).padStart(9, '0');
  const user = await prisma.user.create({ data: { phone: `+989${digits}` } });
  userIds.push(user.id);
  return user.id;
}

async function createAddress(userId: string, province = 'Tehran') {
  const address = await prisma.customerAddress.create({
    data: {
      userId,
      firstName: 'Financial',
      lastName: 'Buyer',
      phone: '+989121234567',
      addressLine1: '1 Test Street',
      city: province === 'Tehran' ? 'Tehran' : 'Karaj',
      province,
      postalCode: '1234567890',
    },
  });
  addressIds.push(address.id);
  return address;
}

async function createDiscount(input: { code: string; usageLimit?: number; perCustomerLimit?: number }) {
  const discount = await prisma.discount.create({
    data: { code: input.code, type: DiscountType.FIXED, amount: 20_000, usageLimit: input.usageLimit, perCustomerLimit: input.perCustomerLimit },
  });
  discountIds.push(discount.id);
  return discount;
}

async function addAndCheckout(userId: string, key: string, addressId: string, discountCode?: string) {
  await carts().add(userId, variantId, 1, 'en');
  return orders().checkout(userId, key, undefined, discountCode, addressId);
}

async function cleanupFixtures(): Promise<void> {
  if (userIds.length > 0) {
    await prisma.paymentAttempt.deleteMany({ where: { payment: { order: { userId: { in: userIds } } } } });
    await prisma.payment.deleteMany({ where: { order: { userId: { in: userIds } } } });
    await prisma.discountRedemption.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customerAddress.deleteMany({ where: { id: { in: addressIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (discountIds.length > 0) await prisma.discount.deleteMany({ where: { id: { in: discountIds } } });
  if (rateIds.length > 0) await prisma.shippingRate.deleteMany({ where: { id: { in: rateIds } } });
  userIds = [];
  addressIds = [];
  discountIds = [];
  rateIds = [];
}

describe('Financial checkout PostgreSQL integration', () => {
  beforeAll(async () => {
    prisma = await createVerifiedTestPrismaClient();
    const category = await prisma.category.create({ data: { slug: `${suffix}-category`, translations: { create: { locale: 'en', name: 'Financial tests' } } } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${suffix}-product`, sku: `${suffix}-product`, categoryId, status: ProductStatus.ACTIVE, basePriceMinor: 100_000, currency: 'IRR',
        translations: { create: { locale: 'en', name: 'Financial frame' } },
        variants: { create: [{ sku: `${suffix}-main`, name: 'Main', stockOnHand: 30 }, { sku: `${suffix}-low`, name: 'Low', stockOnHand: 1 }] },
      },
      include: { variants: { orderBy: { name: 'asc' } } },
    });
    productId = product.id;
    lowStockVariantId = product.variants[0].id;
    variantId = product.variants[1].id;
  });

  beforeEach(async () => {
    await prisma.productVariant.updateMany({ where: { productId }, data: { stockOnHand: 30, stockReserved: 0, isActive: true, priceMinor: null } });
    await prisma.productVariant.update({ where: { id: lowStockVariantId }, data: { stockOnHand: 1 } });
    const rate = await prisma.shippingRate.upsert({ where: { province: 'Tehran' }, create: { province: 'Tehran', method: 'Standard', priceMinor: shippingRateMinor, estimatedDays: 2 }, update: { method: 'Standard', priceMinor: shippingRateMinor, estimatedDays: 2, isActive: true } });
    rateIds.push(rate.id);
  });

  afterEach(cleanupFixtures);

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.product.delete({ where: { id: productId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('uses the owned address and database shipping rate', async () => {
    const userId = await createUser();
    const address = await createAddress(userId);
    const result = await addAndCheckout(userId, `${suffix}-shipping`, address.id);
    expect(result.data).toMatchObject({
      currency: 'IRR',
      subtotal: { amountMinor: 100_000 },
      shipping: { amountMinor: shippingRateMinor },
      total: { amountMinor: 115_000 },
      shippingMethod: 'Standard',
      deliveryEstimateDays: 2,
    });
  });

  it('uses the same active rate for equivalent saved and inline Iranian addresses', async () => {
    const savedAddressUser = await createUser();
    const inlineAddressUser = await createUser();
    const savedAddress = await createAddress(savedAddressUser);
    const saved = await addAndCheckout(savedAddressUser, `${suffix}-saved-rate`, savedAddress.id);
    await carts().add(inlineAddressUser, variantId, 1, 'en');
    const inline = await orders().checkout(inlineAddressUser, `${suffix}-inline-rate`, {
      firstName: 'Financial', lastName: 'Buyer', phone: '+989121234567', addressLine1: '1 Test Street',
      city: 'Tehran', region: 'Tehran', postalCode: '1234567890', countryCode: 'IR',
    });

    expect(inline.data).toMatchObject({
      shipping: { amountMinor: shippingRateMinor }, shippingMethod: 'Standard', deliveryEstimateDays: 2,
    });
    expect(inline.data.shipping).toEqual(saved.data.shipping);
    expect(inline.data.total.amountMinor).toBe(saved.data.total.amountMinor);
  });

  it('rejects an address owned by another customer', async () => {
    const buyer = await createUser();
    const otherUser = await createUser();
    const otherAddress = await createAddress(otherUser);
    await carts().add(buyer, variantId, 1, 'en');
    await expect(orders().checkout(buyer, `${suffix}-foreign`, undefined, undefined, otherAddress.id)).rejects.toMatchObject({ code: 'SHIPPING_ADDRESS_NOT_FOUND' });
  });

  it('rejects missing and inactive shipping rates without a partial order', async () => {
    const userId = await createUser();
    const noRateAddress = await createAddress(userId, 'Alborz');
    await carts().add(userId, variantId, 1, 'en');
    await expect(orders().checkout(userId, `${suffix}-missing-rate`, undefined, undefined, noRateAddress.id)).rejects.toMatchObject({ code: 'SHIPPING_UNAVAILABLE' });
    expect(await prisma.order.count({ where: { userId } })).toBe(0);

    const activeAddress = await createAddress(userId);
    await prisma.shippingRate.update({ where: { id: rateIds[0] }, data: { isActive: false } });
    await expect(orders().checkout(userId, `${suffix}-inactive-rate`, undefined, undefined, activeAddress.id)).rejects.toMatchObject({ code: 'SHIPPING_UNAVAILABLE' });

    const inlineUser = await createUser();
    await carts().add(inlineUser, variantId, 1, 'en');
    await expect(orders().checkout(inlineUser, `${suffix}-inline-inactive-rate`, {
      firstName: 'Financial', lastName: 'Buyer', phone: '+989121234567', addressLine1: '1 Test Street',
      city: 'Tehran', region: 'Tehran', postalCode: '1234567890', countryCode: 'IR',
    })).rejects.toMatchObject({ code: 'SHIPPING_UNAVAILABLE' });
    expect(await prisma.order.count({ where: { userId: inlineUser } })).toBe(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(0);
  });

  it('persists immutable shipping and combined financial snapshots', async () => {
    const userId = await createUser();
    const address = await createAddress(userId);
    const discount = await createDiscount({ code: `${suffix}-discount`.toUpperCase() });
    const result = await addAndCheckout(userId, `${suffix}-snapshot`, address.id, discount.code);
    await prisma.shippingRate.update({ where: { id: rateIds[0] }, data: { priceMinor: 99_999, method: 'Changed', estimatedDays: 9 } });
    await prisma.customerAddress.update({ where: { id: address.id }, data: { addressLine1: 'Changed address' } });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.data.id }, include: { shippingAddress: true } });
    expect(order).toMatchObject({ subtotalMinor: 100_000, discountMinor: 20_000, shippingMinor: shippingRateMinor, totalMinor: 95_000, shippingMethod: 'Standard', deliveryEstimateDays: 2 });
    expect(order.shippingAddress?.addressLine1).toBe('1 Test Street');
  });

  it('is idempotent and does not create duplicate discount redemptions', async () => {
    const userId = await createUser();
    const address = await createAddress(userId);
    const discount = await createDiscount({ code: `${suffix}-idempotent`.toUpperCase() });
    const key = `${suffix}-same-key`;
    const first = await addAndCheckout(userId, key, address.id, discount.code);
    const second = await orders().checkout(userId, key, undefined, discount.code, address.id);
    expect(second.data.id).toBe(first.data.id);
    expect(await prisma.discountRedemption.count({ where: { orderId: first.data.id } })).toBe(1);
  });

  it('rolls back inventory and discount state when checkout fails', async () => {
    const userId = await createUser();
    const address = await createAddress(userId);
    const discount = await createDiscount({ code: `${suffix}-rollback`.toUpperCase() });
    const cart = await carts().add(userId, variantId, 1, 'en');
    await prisma.cartItem.create({ data: { cartId: cart.data.id, variantId: lowStockVariantId, quantity: 1 } });
    await prisma.productVariant.update({ where: { id: lowStockVariantId }, data: { stockReserved: 1 } });
    await expect(orders().checkout(userId, `${suffix}-rollback`, undefined, discount.code, address.id)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(await prisma.discountRedemption.count({ where: { discountId: discount.id } })).toBe(0);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockReserved).toBe(0);
  });

  it('consumes a reservation after successful payment and preserves the payment amount', async () => {
    const userId = await createUser();
    const address = await createAddress(userId);
    const discount = await createDiscount({ code: `${suffix}-paid`.toUpperCase() });
    const order = await addAndCheckout(userId, `${suffix}-paid`, address.id, discount.code);
    const payments = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await payments.initiate(userId, order.data.id);
    expect(payment.data.amount.amountMinor).toBe(order.data.total.amountMinor);
    await payments.mockAction(userId, payment.data.id, 'success');
    expect(await prisma.discountRedemption.findUniqueOrThrow({ where: { orderId: order.data.id } })).toMatchObject({ status: DiscountRedemptionStatus.CONSUMED });
  });

  it('releases a reservation after payment cancellation and order expiry', async () => {
    const firstUser = await createUser();
    const firstAddress = await createAddress(firstUser);
    const firstDiscount = await createDiscount({ code: `${suffix}-cancel`.toUpperCase(), usageLimit: 1 });
    const firstOrder = await addAndCheckout(firstUser, `${suffix}-cancel`, firstAddress.id, firstDiscount.code);
    const payments = new PaymentService(prisma, new MockPaymentProvider(), true);
    const payment = await payments.initiate(firstUser, firstOrder.data.id);
    await payments.mockAction(firstUser, payment.data.id, 'cancel');
    expect(await prisma.discountRedemption.findUniqueOrThrow({ where: { orderId: firstOrder.data.id } })).toMatchObject({ status: DiscountRedemptionStatus.RELEASED });

    const secondUser = await createUser();
    const secondAddress = await createAddress(secondUser);
    const secondDiscount = await createDiscount({ code: `${suffix}-expiry`.toUpperCase(), usageLimit: 1 });
    const secondOrder = await addAndCheckout(secondUser, `${suffix}-expiry`, secondAddress.id, secondDiscount.code);
    await prisma.order.update({ where: { id: secondOrder.data.id }, data: { reservationExpiresAt: new Date(Date.now() - 1_000) } });
    await orders().expirePendingOrders();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: secondOrder.data.id } })).toMatchObject({ status: OrderStatus.EXPIRED });
    expect(await prisma.discountRedemption.findUniqueOrThrow({ where: { orderId: secondOrder.data.id } })).toMatchObject({ status: DiscountRedemptionStatus.RELEASED });
  });

  it('enforces global discount limits under concurrent checkout', async () => {
    const discount = await createDiscount({ code: `${suffix}-global`.toUpperCase(), usageLimit: 1 });
    const one = await createUser();
    const two = await createUser();
    const oneAddress = await createAddress(one);
    const twoAddress = await createAddress(two);
    await Promise.all([carts().add(one, variantId, 1, 'en'), carts().add(two, variantId, 1, 'en')]);
    const results = await Promise.allSettled([
      orders().checkout(one, `${suffix}-global-one`, undefined, discount.code, oneAddress.id),
      orders().checkout(two, `${suffix}-global-two`, undefined, discount.code, twoAddress.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.discountRedemption.count({ where: { discountId: discount.id } })).toBe(1);
  });

  it('enforces the per-customer discount limit under concurrent serializable transactions', async () => {
    const userId = await createUser();
    const discount = await createDiscount({ code: `${suffix}-per-customer`.toUpperCase(), perCustomerLimit: 1 });
    const service = new DiscountService();
    const orderOne = await prisma.order.create({ data: { userId, idempotencyKey: `${suffix}-reserve-one`, currency: 'IRR', subtotalMinor: 100_000, totalMinor: 100_000 } });
    const orderTwo = await prisma.order.create({ data: { userId, idempotencyKey: `${suffix}-reserve-two`, currency: 'IRR', subtotalMinor: 100_000, totalMinor: 100_000 } });
    const reserve = (orderId: string) => prisma.$transaction(
      (tx) => service.reserveInTransaction(tx, userId, orderId, discount.code, 100_000),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const results = await Promise.allSettled([reserve(orderOne.id), reserve(orderTwo.id)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.discountRedemption.count({ where: { discountId: discount.id, userId } })).toBe(1);
    expect(await prisma.discount.findUniqueOrThrow({ where: { id: discount.id } })).toMatchObject({ usageCount: 1 });
  });

  it('returns one order for concurrent retries with the same idempotency key', async () => {
    const userId = await createUser();
    const address = await createAddress(userId);
    await carts().add(userId, variantId, 1, 'en');
    const key = `${suffix}-concurrent-idempotency`;
    const results = await Promise.allSettled([
      orders().checkout(userId, key, undefined, undefined, address.id),
      orders().checkout(userId, key, undefined, undefined, address.id),
    ]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<OrderService['checkout']>>> => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled[0].value.data.id).toBe(fulfilled[1].value.data.id);
    expect(await prisma.order.count({ where: { userId, idempotencyKey: key } })).toBe(1);
  });
});
