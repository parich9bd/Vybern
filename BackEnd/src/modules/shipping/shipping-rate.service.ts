import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { isSupportedIranianLocation } from './shipping.schemas.js';

export type IranianShippingDestination = {
  countryCode: string;
  province: string | null | undefined;
  city: string;
};

export type ResolvedShippingRate = {
  shippingMinor: number;
  shippingMethod: string;
  deliveryEstimateDays: number;
};

/**
 * Resolves the only server-authoritative shipping price used by checkout.
 * Both saved addresses and inline addresses must pass this boundary.
 */
export async function resolveIranianShippingRate(
  tx: Prisma.TransactionClient,
  destination: IranianShippingDestination,
): Promise<ResolvedShippingRate> {
  if (destination.countryCode.toUpperCase() !== 'IR'
    || !destination.province
    || !isSupportedIranianLocation(destination.province, destination.city)) {
    throw new AppError(409, 'SHIPPING_UNAVAILABLE', 'Shipping is unavailable for this address');
  }

  const rate = await tx.shippingRate.findUnique({ where: { province: destination.province } });
  if (!rate || !rate.isActive) {
    throw new AppError(409, 'SHIPPING_UNAVAILABLE', 'Shipping is unavailable for this address');
  }

  return {
    shippingMinor: rate.priceMinor,
    shippingMethod: rate.method,
    deliveryEstimateDays: rate.estimatedDays,
  };
}
