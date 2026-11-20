import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FulfillmentStatus, OrderStatus, PaymentProvider, PaymentStatus, PrismaClient, UserRole } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { AdminOrderManagementService } from './order-management.service.js';

const prisma = new PrismaClient();
const service = new AdminOrderManagementService(prisma);
const suffix = `${Date.now()}`;
let customerId: string;
let paidOrderId: string;
let unpaidOrderId: string;
let paymentId: string;

async function createOrder(status: OrderStatus, key: string): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId: customerId, status, idempotencyKey: key, currency: 'IRR', subtotalMinor: 150_000, totalMinor: 150_000,
      shippingAddress: { create: { firstName: 'Pari', lastName: 'Test', phone: '+989120000000', addressLine1: 'Test street', city: 'Tehran', postalCode: '1234567890', countryCode: 'IR' } },
      items: { create: { productSlug: 'test-frame', productSku: `SKU-${suffix}`, productName: 'Test frame', variantSku: `VAR-${suffix}`, variantName: 'Test variant', unitPriceMinor: 150_000, quantity: 1, lineTotalMinor: 150_000, currency: 'IRR' } },
    }, select: { id: true },
  });
  return order.id;
}

describe('Admin order management integration', () => {
  beforeAll(async () => {
    customerId = (await prisma.user.create({ data: { phone: `+4477${suffix.slice(-8).padStart(8, '0')}`, firstName: 'Pari', lastName: 'Customer', role: UserRole.CUSTOMER } })).id;
    paidOrderId = await createOrder(OrderStatus.PAID, `paid-${suffix}`);
    unpaidOrderId = await createOrder(OrderStatus.PENDING_PAYMENT, `unpaid-${suffix}`);
    paymentId = (await prisma.payment.create({ data: { orderId: paidOrderId, provider: PaymentProvider.MOCK, status: PaymentStatus.SUCCEEDED, amountMinor: 150_000, currency: 'IRR', verifiedAt: new Date(), attempts: { create: { providerReference: `mock-${suffix}`, status: PaymentStatus.SUCCEEDED, amountMinor: 150_000, currency: 'IRR', completedAt: new Date() } } } })).id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { orderId: { in: [paidOrderId, unpaidOrderId] } } });
    await prisma.order.deleteMany({ where: { id: { in: [paidOrderId, unpaidOrderId] } } });
    await prisma.user.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('enforces paid-only, forward-only fulfilment transitions and records notes', async () => {
    await expect(service.transitionFulfillment(unpaidOrderId, FulfillmentStatus.PROCESSING)).rejects.toMatchObject({ code: 'ORDER_NOT_PAID' } satisfies Partial<AppError>);
    await expect(service.transitionFulfillment(paidOrderId, FulfillmentStatus.SHIPPED, 'TRACK-1')).rejects.toMatchObject({ code: 'INVALID_FULFILLMENT_TRANSITION' } satisfies Partial<AppError>);
    expect((await service.transitionFulfillment(paidOrderId, FulfillmentStatus.PROCESSING)).data.fulfillmentStatus).toBe(FulfillmentStatus.PROCESSING);
    await expect(service.transitionFulfillment(paidOrderId, FulfillmentStatus.SHIPPED)).rejects.toMatchObject({ code: 'TRACKING_NUMBER_REQUIRED' } satisfies Partial<AppError>);
    expect((await service.transitionFulfillment(paidOrderId, FulfillmentStatus.SHIPPED, 'TRACK-1')).data.trackingNumber).toBe('TRACK-1');
    expect((await service.transitionFulfillment(paidOrderId, FulfillmentStatus.DELIVERED)).data.fulfillmentStatus).toBe(FulfillmentStatus.DELIVERED);
    const note = await service.addInternalNote(paidOrderId, customerId, 'Internal fulfilment note');
    expect(note.body).toBe('Internal fulfilment note');
  });

  it('rejects concurrent competing fulfilment updates', async () => {
    const orderId = await createOrder(OrderStatus.PAID, `concurrent-${suffix}`);
    const result = await Promise.allSettled([
      service.transitionFulfillment(orderId, FulfillmentStatus.PROCESSING),
      service.transitionFulfillment(orderId, FulfillmentStatus.PROCESSING),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    await prisma.order.delete({ where: { id: orderId } });
  });

  it('lists customer and payment monitoring data without authentication metadata', async () => {
    const customers = await service.listCustomers({ page: 1, limit: 10, search: 'Pari' });
    expect(customers.data.some((customer) => customer.id === customerId)).toBe(true);
    const customer = await service.getCustomer(customerId);
    expect(customer.data).not.toHaveProperty('sessions');
    expect(customer.data.orders.some((order) => order.id === paidOrderId)).toBe(true);
    const payments = await service.listPayments({ page: 1, limit: 10, status: PaymentStatus.SUCCEEDED, provider: PaymentProvider.MOCK });
    expect(payments.data.some((payment) => payment.id === paymentId && payment.isMock)).toBe(true);
    const payment = await service.getPayment(paymentId);
    expect(payment.data.attempts).toHaveLength(1);
    expect(payment.data.order.id).toBe(paidOrderId);
  });
});
