import { Prisma, PrismaClient, ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { SupportedLocale } from '../products/product.schemas.js';

const cartInclude = (locale: SupportedLocale) => ({
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          product: {
            include: {
              translations: { where: { locale } },
              images: { orderBy: { position: 'asc' as const }, take: 1 },
            },
          },
        },
      },
    },
  },
});

type CartWithItems = Prisma.CartGetPayload<{ include: ReturnType<typeof cartInclude> }>;

function availableQuantity(variant: { stockOnHand: number; stockReserved: number }): number {
  return Math.max(0, variant.stockOnHand - variant.stockReserved);
}

function serialiseCart(cart: CartWithItems) {
  const items = cart.items.map((item) => {
    const { variant } = item;
    const { product } = variant;
    const unitPriceMinor = variant.priceMinor ?? product.basePriceMinor;
    const isAvailable = product.status === ProductStatus.ACTIVE && variant.isActive && availableQuantity(variant) >= item.quantity;
    return {
      id: item.id,
      quantity: item.quantity,
      availableQuantity: availableQuantity(variant),
      available: isAvailable,
      product: {
        id: product.id,
        slug: product.slug,
        sku: product.sku,
        name: product.translations[0]?.name ?? null,
        image: product.images[0] ? { url: product.images[0].url, alt: product.images[0].alt } : null,
      },
      variant: { id: variant.id, sku: variant.sku, name: variant.name, colour: variant.colour },
      unitPrice: { amountMinor: unitPriceMinor, currency: product.currency },
      lineTotal: { amountMinor: unitPriceMinor * item.quantity, currency: product.currency },
    };
  });
  const currency = cart.currency;
  const subtotalMinor = items.reduce((total, item) => total + item.lineTotal.amountMinor, 0);
  return {
    data: {
      id: cart.id,
      currency,
      items,
      subtotal: { amountMinor: subtotalMinor, currency },
      total: { amountMinor: subtotalMinor, currency },
      totalItemCount: items.reduce((total, item) => total + item.quantity, 0),
    },
  };
}

export class CartService {
  constructor(private readonly prisma: PrismaClient) {}

  private async cartForUser(userId: string, locale: SupportedLocale): Promise<CartWithItems> {
    await this.prisma.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    return this.prisma.cart.findUniqueOrThrow({ where: { userId }, include: cartInclude(locale) });
  }

  private async transaction(action: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
      }
    }
  }

  async get(userId: string, locale: SupportedLocale) {
    return serialiseCart(await this.cartForUser(userId, locale));
  }

  async add(userId: string, variantId: string, quantity: number, locale: SupportedLocale) {
    await this.transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
      if (!variant || !variant.isActive || variant.product.status !== ProductStatus.ACTIVE) {
        throw new AppError(404, 'PRODUCT_UNAVAILABLE', 'Product is unavailable');
      }
      const available = availableQuantity(variant);
      if (available < quantity) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity is not available');
      const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId, currency: variant.product.currency } });
      if (cart.currency && cart.currency !== variant.product.currency) {
        throw new AppError(409, 'CART_CURRENCY_MISMATCH', 'Items in a cart must use the same currency');
      }
      if (!cart.currency) await tx.cart.update({ where: { id: cart.id }, data: { currency: variant.product.currency } });
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > available) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity is not available');
      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
      else await tx.cartItem.create({ data: { cartId: cart.id, variantId, quantity } });
    });
    return this.get(userId, locale);
  }

  async update(userId: string, itemId: string, quantity: number, locale: SupportedLocale) {
    await this.transaction(async (tx) => {
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cart: { userId } }, include: { variant: { include: { product: true } } } });
      if (!item) throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found');
      if (!item.variant.isActive || item.variant.product.status !== ProductStatus.ACTIVE) {
        throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Product is unavailable');
      }
      if (quantity > availableQuantity(item.variant)) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity is not available');
      await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
    });
    return this.get(userId, locale);
  }

  async remove(userId: string, itemId: string, locale: SupportedLocale) {
    await this.transaction(async (tx) => {
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cart: { userId } }, select: { id: true, cartId: true } });
      if (!item) throw new AppError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found');
      await tx.cartItem.delete({ where: { id: item.id } });
      const remaining = await tx.cartItem.count({ where: { cartId: item.cartId } });
      if (remaining === 0) await tx.cart.update({ where: { id: item.cartId }, data: { currency: null } });
    });
    return this.get(userId, locale);
  }

  async clear(userId: string, locale: SupportedLocale) {
    await this.transaction(async (tx) => {
      const cart = await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      if (cart.currency) await tx.cart.update({ where: { id: cart.id }, data: { currency: null } });
    });
    return this.get(userId, locale);
  }
}
