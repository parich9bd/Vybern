import { FulfillmentStatus, OrderStatus, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { NotificationOutboxService } from '../notifications/notification-outbox.service.js';

const orderInclude = {
  user: { select: { id: true, phone: true, firstName: true, lastName: true, status: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
  shippingAddress: true,
  payment: { include: { attempts: { orderBy: { createdAt: 'desc' as const } } } },
  internalNotes: { orderBy: { createdAt: 'desc' as const } },
};
type AdminOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function money(amountMinor: number, currency: string) { return { amountMinor, currency }; }
function orderSummary(order: AdminOrder) {
  return {
    id: order.id, status: order.status, fulfillmentStatus: order.fulfillmentStatus, currency: order.currency,
    subtotal: money(order.subtotalMinor, order.currency), total: money(order.totalMinor, order.currency),
    trackingNumber: order.trackingNumber, shippedAt: order.shippedAt?.toISOString() ?? null, deliveredAt: order.deliveredAt?.toISOString() ?? null,
    reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
    customer: order.user,
  };
}
function serialiseOrder(order: AdminOrder) {
  return {
    ...orderSummary(order), shippingAddress: order.shippingAddress,
    items: order.items.map((item) => ({
      id: item.id, quantity: item.quantity,
      product: { id: item.productId, slug: item.productSlug, sku: item.productSku, name: item.productName },
      variant: { id: item.variantId, sku: item.variantSku, name: item.variantName, colour: item.variantColour },
      unitPrice: money(item.unitPriceMinor, item.currency), lineTotal: money(item.lineTotalMinor, item.currency),
    })),
    payment: order.payment && { id: order.payment.id, provider: order.payment.provider, isMock: order.payment.provider === 'MOCK', status: order.payment.status, amount: money(order.payment.amountMinor, order.payment.currency), verifiedAt: order.payment.verifiedAt?.toISOString() ?? null },
    internalNotes: order.internalNotes.map((note) => ({ id: note.id, authorUserId: note.authorUserId, body: note.body, createdAt: note.createdAt.toISOString() })),
  };
}

export class AdminOrderManagementService {
  private readonly notifications: NotificationOutboxService;
  constructor(private readonly prisma: PrismaClient) { this.notifications = new NotificationOutboxService(prisma); }

  async listOrders(query: { page: number; limit: number; search?: string; status?: OrderStatus; fulfillmentStatus?: FulfillmentStatus }) {
    const where: Prisma.OrderWhereInput = {
      status: query.status, fulfillmentStatus: query.fulfillmentStatus,
      ...(query.search ? { OR: [{ id: { contains: query.search, mode: 'insensitive' } }, { user: { phone: { contains: query.search } } }, { trackingNumber: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.order.count({ where }),
    ]);
    return { data: orders.map(orderSummary), meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return { data: serialiseOrder(order) };
  }

  async transitionFulfillment(orderId: string, nextStatus: FulfillmentStatus, trackingNumber?: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, fulfillmentStatus: true } });
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
      if (order.status !== OrderStatus.PAID) throw new AppError(409, 'ORDER_NOT_PAID', 'Only paid orders may enter fulfilment');
      const allowed: Record<FulfillmentStatus, FulfillmentStatus | null> = { UNFULFILLED: FulfillmentStatus.PROCESSING, PROCESSING: FulfillmentStatus.SHIPPED, SHIPPED: FulfillmentStatus.DELIVERED, DELIVERED: null };
      if (allowed[order.fulfillmentStatus] !== nextStatus) throw new AppError(409, 'INVALID_FULFILLMENT_TRANSITION', 'Invalid fulfilment status transition');
      if (nextStatus === FulfillmentStatus.SHIPPED && !trackingNumber) throw new AppError(400, 'TRACKING_NUMBER_REQUIRED', 'A tracking number is required when shipping an order');
      const now = new Date();
      const updated = await tx.order.updateMany({
        where: { id: order.id, fulfillmentStatus: order.fulfillmentStatus, status: OrderStatus.PAID },
        data: { fulfillmentStatus: nextStatus, ...(trackingNumber ? { trackingNumber } : {}), ...(nextStatus === FulfillmentStatus.SHIPPED ? { shippedAt: now } : {}), ...(nextStatus === FulfillmentStatus.DELIVERED ? { deliveredAt: now } : {}) },
      });
      if (updated.count !== 1) throw new AppError(409, 'FULFILLMENT_UPDATE_CONFLICT', 'Order fulfilment was updated concurrently');
      if (nextStatus === FulfillmentStatus.SHIPPED) await this.notifications.enqueueInTransaction(tx, 'ORDER_SHIPPED', order.id, { orderId: order.id });
      if (nextStatus === FulfillmentStatus.DELIVERED) await this.notifications.enqueueInTransaction(tx, 'ORDER_DELIVERED', order.id, { orderId: order.id });
    });
    return this.getOrder(orderId);
  }

  async addInternalNote(orderId: string, authorUserId: string, body: string) {
    const exists = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!exists) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return this.prisma.orderNote.create({ data: { orderId, authorUserId, body }, select: { id: true, authorUserId: true, body: true, createdAt: true } });
  }

  async listCustomers(query: { page: number; limit: number; search?: string }) {
    const where: Prisma.UserWhereInput = { role: UserRole.CUSTOMER, ...(query.search ? { OR: [{ phone: { contains: query.search } }, { firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }] } : {}) };
    const [customers, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: { id: true, phone: true, firstName: true, lastName: true, status: true, createdAt: true, _count: { select: { orders: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.user.count({ where }),
    ]);
    return { data: customers.map(({ _count, ...customer }) => ({ ...customer, orderCount: _count.orders })), meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async getCustomer(customerId: string) {
    const customer = await this.prisma.user.findFirst({ where: { id: customerId, role: UserRole.CUSTOMER }, select: { id: true, phone: true, firstName: true, lastName: true, status: true, createdAt: true, orders: { include: { items: true, user: { select: { id: true, phone: true, firstName: true, lastName: true, status: true } }, shippingAddress: true, payment: { include: { attempts: true } }, internalNotes: true }, orderBy: { createdAt: 'desc' } } } });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    return { data: { ...customer, orders: customer.orders.map(serialiseOrder) } };
  }

  async listPayments(query: { page: number; limit: number; status?: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED'; provider?: 'MOCK' | 'ZARINPAL'; orderId?: string }) {
    const where: Prisma.PaymentWhereInput = { status: query.status, provider: query.provider, orderId: query.orderId };
    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ where, include: { order: { include: { user: { select: { id: true, phone: true, firstName: true, lastName: true, status: true } } } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.payment.count({ where }),
    ]);
    return { data: payments.map((payment) => ({ id: payment.id, provider: payment.provider, isMock: payment.provider === 'MOCK', status: payment.status, amount: money(payment.amountMinor, payment.currency), verifiedAt: payment.verifiedAt?.toISOString() ?? null, expiresAt: payment.expiresAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(), order: { id: payment.order.id, status: payment.order.status, customer: payment.order.user } })), meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async getPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { attempts: { orderBy: { createdAt: 'desc' } }, order: { include: { user: { select: { id: true, phone: true, firstName: true, lastName: true, status: true } } } } } });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    return { data: { id: payment.id, provider: payment.provider, isMock: payment.provider === 'MOCK', status: payment.status, amount: money(payment.amountMinor, payment.currency), verifiedAt: payment.verifiedAt?.toISOString() ?? null, expiresAt: payment.expiresAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(), order: { id: payment.order.id, status: payment.order.status, customer: payment.order.user }, attempts: payment.attempts.map((attempt) => ({ id: attempt.id, providerReference: attempt.providerReference, status: attempt.status, amount: money(attempt.amountMinor, attempt.currency), expiresAt: attempt.expiresAt?.toISOString() ?? null, completedAt: attempt.completedAt?.toISOString() ?? null, failureCode: attempt.failureCode, createdAt: attempt.createdAt.toISOString() })) } };
  }
}
