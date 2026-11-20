import { z } from 'zod';

const id = z.string().min(1).max(32);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);

export const orderParamsSchema = z.object({ orderId: id });
export const customerParamsSchema = z.object({ customerId: id });
export const paymentParamsSchema = z.object({ paymentId: id });

export const adminOrderListQuerySchema = z.object({
  page, limit,
  search: z.string().trim().min(1).max(160).optional(),
  status: z.enum(['PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'FULFILLED']).optional(),
  fulfillmentStatus: z.enum(['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED']).optional(),
});

export const fulfillmentSchema = z.object({
  status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']),
  trackingNumber: z.string().trim().min(1).max(100).optional(),
});

export const orderNoteSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export const customerListQuerySchema = z.object({ page, limit, search: z.string().trim().min(1).max(160).optional() });

export const paymentListQuerySchema = z.object({
  page, limit,
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED']).optional(),
  provider: z.enum(['MOCK', 'ZARINPAL']).optional(),
  orderId: id.optional(),
});
