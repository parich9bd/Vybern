import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const shippingAddressSchema = z.object({
  firstName: text(100),
  lastName: text(100),
  phone: z.string().trim().min(3).max(32),
  addressLine1: text(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: text(100),
  region: text(100),
  postalCode: text(32),
  countryCode: z.literal('IR'),
});

export const checkoutSchema = z.object({ shippingAddress: shippingAddressSchema.optional(), shippingAddressId: z.string().min(1).max(32).optional(), discountCode: z.string().trim().min(3).max(64).optional() }).refine((value) => Boolean(value.shippingAddress) !== Boolean(value.shippingAddressId), 'Provide exactly one shipping address');
export const orderParamsSchema = z.object({ orderId: z.string().min(1).max(32) });
export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const idempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);

// Historical services may construct snapshots directly; checkout validates the
// Iranian destination before any reservation is written.
export type ShippingAddressInput = {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region?: string;
  postalCode: string;
  countryCode: string;
};
