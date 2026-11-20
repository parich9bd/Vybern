import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
}).strict().refine((value) => value.firstName !== undefined || value.lastName !== undefined, 'At least one field is required');

export const sessionParamsSchema = z.object({ sessionId: z.string().min(1).max(32) });

export const paymentHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
