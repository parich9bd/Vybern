import { OrderStatus, PaymentProvider as PaymentProviderName, PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { OrderService } from '../orders/order.service.js';
import { DiscountService } from '../discounts/discount.service.js';
import type { PaymentProvider } from './payment.provider.js';
import type { MockPaymentAction } from './payment.schemas.js';
import { NotificationOutboxService } from '../notifications/notification-outbox.service.js';

const paymentInclude = {
  order: { include: { items: true } },
  attempts: { orderBy: { createdAt: 'desc' as const } },
};
type PaymentWithDetails = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function serialisePayment(payment: PaymentWithDetails) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    status: payment.status,
    amount: { amountMinor: payment.amountMinor, currency: payment.currency },
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

export class PaymentService {
  private readonly orders: OrderService;
  private readonly discounts = new DiscountService();
  private readonly notifications: NotificationOutboxService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: PaymentProvider,
    private readonly isDevelopment: boolean,
  ) {
    this.orders = new OrderService(prisma);
    this.notifications = new NotificationOutboxService(prisma);
  }

  private async transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        return await this.prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: unknown) {
        const details = error instanceof Error ? error.message : '';
        const isSerializableConflict = details.includes('write conflict') || details.includes('could not serialize access')
          || (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || (error.code === 'P2010' && String(error.meta?.code) === '40001')));
        if (!isSerializableConflict || attempt === 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw new Error('Unreachable transaction state');
  }

  private assertMockEnabled(): void {
    if (!this.isDevelopment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  }

  async initiate(userId: string, orderId: string) {
    let paymentId: string;
    try {
      paymentId = await this.transaction(async (tx) => {
        const now = new Date();
        await this.orders.releaseExpiredReservations(tx, now);
        const order = await tx.order.findFirst({ where: { id: orderId, userId }, include: { payment: true } });
        if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
        if (order.status !== OrderStatus.PENDING_PAYMENT || !order.reservationExpiresAt || order.reservationExpiresAt <= now) {
          throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Order is not payable');
        }
        if (order.payment?.status === PaymentStatus.SUCCEEDED) return order.payment.id;
        if (order.payment?.status === PaymentStatus.PENDING) return order.payment.id;
        if (order.payment?.status === PaymentStatus.CANCELLED || order.payment?.status === PaymentStatus.EXPIRED) {
          throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Order is not payable');
        }
        const request = await this.provider.createPayment({ amountMinor: order.totalMinor, currency: order.currency, expiresAt: order.reservationExpiresAt }).catch(() => {
          throw new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment provider is unavailable');
        });
        if (request.provider !== PaymentProviderName.MOCK && this.isDevelopment) throw new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment provider is unavailable');
        if (order.payment) {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: {
              provider: request.provider, amountMinor: order.totalMinor, currency: order.currency, status: PaymentStatus.PENDING,
              expiresAt: order.reservationExpiresAt, verifiedAt: null,
              attempts: { create: { providerReference: request.providerReference, amountMinor: order.totalMinor, currency: order.currency, expiresAt: order.reservationExpiresAt } },
            },
          });
          return order.payment.id;
        }
        const payment = await tx.payment.create({
          data: {
            orderId: order.id, provider: request.provider, amountMinor: order.totalMinor, currency: order.currency, status: PaymentStatus.PENDING, expiresAt: order.reservationExpiresAt,
            attempts: { create: { providerReference: request.providerReference, amountMinor: order.totalMinor, currency: order.currency, expiresAt: order.reservationExpiresAt } },
          },
          select: { id: true },
        });
        return payment.id;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const payment = await this.prisma.payment.findFirst({ where: { orderId, order: { userId } }, select: { id: true } });
        if (!payment) throw error;
        paymentId = payment.id;
      } else throw error;
    }
    return this.get(userId, paymentId);
  }

  async get(userId: string, paymentId: string) {
    await this.orders.expirePendingOrders();
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, order: { userId } }, include: paymentInclude });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    return { data: serialisePayment(payment) };
  }

  async mockAction(userId: string, paymentId: string, action: MockPaymentAction) {
    this.assertMockEnabled();
    const payment = await this.transaction(async (tx) => {
      const now = new Date();
      await this.orders.releaseExpiredReservations(tx, now);
      const current = await tx.payment.findFirst({ where: { id: paymentId, order: { userId } }, include: paymentInclude });
      if (!current || current.provider !== PaymentProviderName.MOCK) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      if (current.status === PaymentStatus.SUCCEEDED) return current;
      if (current.status !== PaymentStatus.PENDING || current.order.status !== OrderStatus.PENDING_PAYMENT || !current.order.reservationExpiresAt || current.order.reservationExpiresAt <= now) {
        throw new AppError(409, 'PAYMENT_NOT_PAYABLE', 'Payment is not payable');
      }
      if (current.amountMinor !== current.order.totalMinor || current.currency !== current.order.currency) {
        throw new AppError(409, 'PAYMENT_AMOUNT_MISMATCH', 'Payment amount does not match order');
      }
      const attempt = current.attempts.find((item) => item.status === PaymentStatus.PENDING);
      if (!attempt) throw new AppError(409, 'PAYMENT_NOT_PAYABLE', 'Payment is not payable');

      if (action === 'success') {
        for (const item of current.order.items) {
          if (!item.variantId) throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Inventory reconciliation is required');
          const settled = await tx.$executeRaw`
            UPDATE "ProductVariant"
            SET "stockReserved" = "stockReserved" - ${item.quantity},
                "stockOnHand" = "stockOnHand" - ${item.quantity},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${item.variantId}
              AND "stockReserved" >= ${item.quantity}
              AND "stockOnHand" >= ${item.quantity}
          `;
          if (settled !== 1) throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Inventory reconciliation is required');
        }
        await tx.order.update({ where: { id: current.orderId }, data: { status: OrderStatus.PAID } });
        await this.discounts.consumeInTransaction(tx, current.orderId);
        await this.notifications.enqueueInTransaction(tx, 'PAYMENT_SUCCEEDED', current.orderId, { orderId: current.orderId, paymentId: current.id });
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: PaymentStatus.SUCCEEDED, completedAt: now } });
        return tx.payment.update({ where: { id: current.id }, data: { status: PaymentStatus.SUCCEEDED, verifiedAt: now }, include: paymentInclude });
      }

      const cancelled = action === 'cancel';
      if (cancelled) {
        const changed = await tx.order.updateMany({ where: { id: current.orderId, status: OrderStatus.PENDING_PAYMENT }, data: { status: OrderStatus.CANCELLED } });
        if (changed.count !== 1) throw new AppError(409, 'PAYMENT_NOT_PAYABLE', 'Payment is not payable');
        for (const item of current.order.items) {
          if (!item.variantId) continue;
          const released = await tx.productVariant.updateMany({ where: { id: item.variantId, stockReserved: { gte: item.quantity } }, data: { stockReserved: { decrement: item.quantity } } });
          if (released.count !== 1) throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Inventory reconciliation is required');
        }
        await this.discounts.releaseInTransaction(tx, current.orderId);
        await this.notifications.enqueueInTransaction(tx, 'ORDER_CANCELLED', current.orderId, { orderId: current.orderId, paymentId: current.id });
      }
      const status = cancelled ? PaymentStatus.CANCELLED : PaymentStatus.FAILED;
      if (!cancelled) await this.notifications.enqueueInTransaction(tx, 'PAYMENT_FAILED', current.orderId, { orderId: current.orderId, paymentId: current.id });
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status, completedAt: now, failureCode: cancelled ? 'MOCK_CANCELLED' : 'MOCK_FAILED' } });
      return tx.payment.update({ where: { id: current.id }, data: { status }, include: paymentInclude });
    });
    return { data: serialisePayment(payment) };
  }
}
