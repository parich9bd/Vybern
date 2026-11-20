import { Prisma, PrismaClient, OrderStatus, ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { ShippingAddressInput } from './order.schemas.js';
import { DiscountService } from '../discounts/discount.service.js';
import { NotificationOutboxService } from '../notifications/notification-outbox.service.js';
import { resolveIranianShippingRate } from '../shipping/shipping-rate.service.js';

const ORDER_RESERVATION_MINUTES = 15;
const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  shippingAddress: true,
};

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function serialiseOrder(order: OrderWithDetails) {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    subtotal: { amountMinor: order.subtotalMinor, currency: order.currency },
    discount: { amountMinor: order.discountMinor, currency: order.currency },
    shipping: { amountMinor: order.shippingMinor, currency: order.currency },
    total: { amountMinor: order.totalMinor, currency: order.currency },
    discountCode: order.discountCode,
    shippingMethod: order.shippingMethod,
    deliveryEstimateDays: order.deliveryEstimateDays,
    reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
    shippingAddress: order.shippingAddress && {
      firstName: order.shippingAddress.firstName,
      lastName: order.shippingAddress.lastName,
      phone: order.shippingAddress.phone,
      addressLine1: order.shippingAddress.addressLine1,
      addressLine2: order.shippingAddress.addressLine2,
      city: order.shippingAddress.city,
      region: order.shippingAddress.region,
      postalCode: order.shippingAddress.postalCode,
      countryCode: order.shippingAddress.countryCode,
    },
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: { id: item.productId, slug: item.productSlug, sku: item.productSku, name: item.productName },
      variant: { id: item.variantId, sku: item.variantSku, name: item.variantName, colour: item.variantColour },
      unitPrice: { amountMinor: item.unitPriceMinor, currency: item.currency },
      lineTotal: { amountMinor: item.lineTotalMinor, currency: item.currency },
    })),
    createdAt: order.createdAt.toISOString(),
  };
}

export class OrderService {
  private readonly discounts = new DiscountService();
  private readonly notifications: NotificationOutboxService;
  constructor(private readonly prisma: PrismaClient) { this.notifications = new NotificationOutboxService(prisma); }

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

  async releaseExpiredReservations(tx: Prisma.TransactionClient, now: Date): Promise<void> {
    const expiredOrders = await tx.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, reservationExpiresAt: { lte: now } },
      include: { items: { select: { variantId: true, quantity: true } } },
    });
    for (const order of expiredOrders) {
      const transitioned = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING_PAYMENT, reservationExpiresAt: { lte: now } },
        data: { status: OrderStatus.EXPIRED },
      });
      if (transitioned.count !== 1) continue;
      await tx.payment.updateMany({ where: { orderId: order.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await this.discounts.releaseInTransaction(tx, order.id);
      await tx.paymentAttempt.updateMany({ where: { payment: { orderId: order.id }, status: 'PENDING' }, data: { status: 'EXPIRED', completedAt: now, failureCode: 'RESERVATION_EXPIRED' } });
      for (const item of order.items) {
        if (!item.variantId) continue;
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId }, select: { id: true } });
        // Historical snapshots can outlive a retired development catalogue record. No live stock remains to release.
        if (!variant) continue;
        const released = await tx.productVariant.updateMany({
          where: { id: item.variantId, stockReserved: { gte: item.quantity } },
          data: { stockReserved: { decrement: item.quantity } },
        });
        if (released.count !== 1) throw new AppError(409, 'INVENTORY_INCONSISTENT', 'Inventory reconciliation is required');
      }
    }
  }

  async expirePendingOrders(): Promise<void> {
    await this.transaction((tx) => this.releaseExpiredReservations(tx, new Date()));
  }

  async checkout(userId: string, idempotencyKey: string, shippingAddress: ShippingAddressInput | undefined, discountCode?: string, shippingAddressId?: string) {
    let orderId: string;
    try {
      orderId = await this.transaction(async (tx) => {
        const now = new Date();
        await this.releaseExpiredReservations(tx, now);
        const previous = await tx.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, select: { id: true } });
        if (previous) return previous.id;
        const cart = await tx.cart.findUnique({
          where: { userId },
          include: {
            items: {
              include: {
                variant: {
                  include: { product: { include: { translations: { where: { locale: 'en' }, take: 1 } } } },
                },
              },
            },
          },
        });
        if (!cart || cart.items.length === 0) throw new AppError(409, 'CART_EMPTY', 'Cart is empty');

        let resolvedAddress = shippingAddress;
        if (shippingAddressId) {
          const address = await tx.customerAddress.findFirst({ where: { id: shippingAddressId, userId } });
          if (!address) throw new AppError(404, 'SHIPPING_ADDRESS_NOT_FOUND', 'Shipping address not found');
          resolvedAddress = { firstName: address.firstName, lastName: address.lastName, phone: address.phone, addressLine1: address.addressLine1, addressLine2: address.addressLine2 ?? undefined, city: address.city, region: address.province, postalCode: address.postalCode, countryCode: 'IR' };
        }
        if (!resolvedAddress) throw new AppError(400, 'SHIPPING_ADDRESS_REQUIRED', 'Shipping address is required');

        const shipping = await resolveIranianShippingRate(tx, {
          countryCode: resolvedAddress.countryCode,
          province: resolvedAddress.region,
          city: resolvedAddress.city,
        });

        const currency = cart.items[0].variant.product.currency;
        if (currency !== 'IRR') {
          throw new AppError(409, 'SHIPPING_CURRENCY_MISMATCH', 'Iranian shipping is only available for IRR orders');
        }
        const snapshotItems = [] as Array<{
          variantId: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number;
          productId: string; productSlug: string; productSku: string; productName: string;
          variantSku: string; variantName: string; variantColour: string | null; currency: string;
        }>;
        for (const cartItem of cart.items) {
          const { variant } = cartItem;
          const { product } = variant;
          if (!variant.isActive || product.status !== ProductStatus.ACTIVE) {
            throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'A cart item is unavailable');
          }
          if (product.currency !== currency) throw new AppError(409, 'CART_CURRENCY_MISMATCH', 'Items in a cart must use the same currency');
          const reserved = await tx.$executeRaw`
            UPDATE "ProductVariant"
            SET "stockReserved" = "stockReserved" + ${cartItem.quantity}, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${variant.id}
              AND "isActive" = true
              AND "stockOnHand" - "stockReserved" >= ${cartItem.quantity}
          `;
          if (reserved !== 1) throw new AppError(409, 'INSUFFICIENT_STOCK', 'A cart item no longer has sufficient stock');
          const unitPriceMinor = variant.priceMinor ?? product.basePriceMinor;
          snapshotItems.push({
            variantId: variant.id, quantity: cartItem.quantity, unitPriceMinor, lineTotalMinor: unitPriceMinor * cartItem.quantity,
            productId: product.id, productSlug: product.slug, productSku: product.sku, productName: product.translations[0]?.name ?? product.slug,
            variantSku: variant.sku, variantName: variant.name, variantColour: variant.colour, currency: product.currency,
          });
        }
        const subtotalMinor = snapshotItems.reduce((total, item) => total + item.lineTotalMinor, 0);
        const order = await tx.order.create({
          data: {
            userId, idempotencyKey, currency, subtotalMinor, totalMinor: subtotalMinor + shipping.shippingMinor,
            shippingMinor: shipping.shippingMinor, shippingMethod: shipping.shippingMethod,
            deliveryEstimateDays: shipping.deliveryEstimateDays,
            reservationExpiresAt: new Date(now.getTime() + ORDER_RESERVATION_MINUTES * 60_000),
            shippingAddress: { create: resolvedAddress },
            items: { create: snapshotItems },
          },
          select: { id: true },
        });
        const discount = await this.discounts.reserveInTransaction(tx, userId, order.id, discountCode, subtotalMinor);
        if (discount.discountMinor) await tx.order.update({ where: { id: order.id }, data: { discountMinor: discount.discountMinor, discountCode: discount.code, totalMinor: subtotalMinor - discount.discountMinor + shipping.shippingMinor } });
        await this.notifications.enqueueInTransaction(tx, 'ORDER_CREATED', order.id, { orderId: order.id, userId });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { currency: null } });
        return order.id;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } }, select: { id: true } });
        if (duplicate) orderId = duplicate.id;
        else throw error;
      } else throw error;
    }
    return this.getById(userId, orderId);
  }

  async list(userId: string, page: number, limit: number) {
    await this.expirePendingOrders();
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return { data: orders.map(serialiseOrder), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(userId: string, orderId: string) {
    await this.expirePendingOrders();
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId }, include: orderInclude });
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return { data: serialiseOrder(order) };
  }
}
