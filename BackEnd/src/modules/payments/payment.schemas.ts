import { z } from 'zod';

export const initiatePaymentSchema = z.object({ orderId: z.string().min(1).max(32) });
export const paymentParamsSchema = z.object({ paymentId: z.string().min(1).max(32) });
export const mockPaymentActionSchema = z.object({ action: z.enum(['success', 'fail', 'cancel']) });
export type MockPaymentAction = z.infer<typeof mockPaymentActionSchema>['action'];
