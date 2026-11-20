import { DiscountRedemptionStatus, DiscountType, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

export class DiscountService {
  async reserveInTransaction(tx: Prisma.TransactionClient, userId: string, orderId: string, code: string | undefined, subtotalMinor: number) {
    if (!code) return { discountMinor: 0, code: undefined };
    const now = new Date();
    const discount = await tx.discount.findFirst({ where: { code: code.trim().toUpperCase(), isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] } });
    if (!discount || subtotalMinor < discount.minimumOrderMinor) throw new AppError(409, 'DISCOUNT_UNAVAILABLE', 'Discount is unavailable');
    const amount = discount.type === DiscountType.PERCENTAGE ? Math.floor(subtotalMinor * discount.amount / 100) : Math.min(discount.amount, subtotalMinor);
    // Serialise reservations for one discount/customer without globally locking the discount table.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`discount:${discount.id}:${userId}`}))`;
    const reserved = await tx.discount.updateMany({ where: { id: discount.id, ...(discount.usageLimit === null ? {} : { usageCount: { lt: discount.usageLimit } }) }, data: { usageCount: { increment: 1 } } });
    if (reserved.count !== 1) throw new AppError(409, 'DISCOUNT_LIMIT_REACHED', 'Discount usage limit reached');
    try {
      if (discount.perCustomerLimit !== null) {
        const used = await tx.discountRedemption.count({
          where: {
            discountId: discount.id,
            userId,
            status: { in: [DiscountRedemptionStatus.RESERVED, DiscountRedemptionStatus.CONSUMED] },
          },
        });
        if (used >= discount.perCustomerLimit) throw new AppError(409, 'DISCOUNT_LIMIT_REACHED', 'Discount customer limit reached');
      }
      await tx.discountRedemption.create({ data: { discountId: discount.id, userId, orderId, amountMinor: amount, status: DiscountRedemptionStatus.RESERVED } });
    } catch (error) {
      await tx.discount.update({ where: { id: discount.id }, data: { usageCount: { decrement: 1 } } });
      throw error;
    }
    return { discountMinor: amount, code: discount.code };
  }
  async releaseInTransaction(tx: Prisma.TransactionClient, orderId: string) {
    const redemption = await tx.discountRedemption.findUnique({ where: { orderId } });
    if (!redemption || redemption.status !== DiscountRedemptionStatus.RESERVED) return;
    const released = await tx.discountRedemption.updateMany({ where: { id: redemption.id, status: DiscountRedemptionStatus.RESERVED }, data: { status: DiscountRedemptionStatus.RELEASED, releasedAt: new Date() } });
    if (released.count) await tx.discount.updateMany({ where: { id: redemption.discountId, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
  }
  async consumeInTransaction(tx: Prisma.TransactionClient, orderId: string) {
    await tx.discountRedemption.updateMany({ where: { orderId, status: DiscountRedemptionStatus.RESERVED }, data: { status: DiscountRedemptionStatus.CONSUMED, consumedAt: new Date() } });
  }
}
