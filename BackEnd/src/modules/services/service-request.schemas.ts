import { z } from 'zod';
import { normaliseE164Phone } from '../auth/auth.schemas.js';

const optionalEmail = z.string().trim().email().max(254).optional().or(z.literal('')).transform((value) => value || undefined);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal('')).transform((value) => value || undefined);
const requestDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value, context) => {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) { context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' }); return z.NEVER; }
  return date;
});

const common = {
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().transform((value, context) => {
    try { return normaliseE164Phone(value); } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone must be in E.164 format' }); return z.NEVER; }
  }),
  email: optionalEmail,
  notes: optionalText(1000),
};

export const eyeExamRequestSchema = z.object({
  ...common,
  examinationType: z.enum(['COMPREHENSIVE', 'VISION_ASSESSMENT', 'PRESCRIPTION_CONSULTATION']),
  preferredDate: requestDate,
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();

export const lensUpgradeRequestSchema = z.object({
  ...common,
  frameBrand: z.string().trim().min(1).max(120),
  frameModel: optionalText(120),
  lensType: z.enum(['SINGLE_VISION', 'PROGRESSIVE', 'BLUE_LIGHT', 'PHOTOCHROMIC', 'CONSULTATION']),
  prescriptionAvailability: z.enum(['HAVE_PRESCRIPTION', 'NEED_EYE_EXAM', 'NEED_ASSISTANCE']),
  consultationDate: requestDate.optional(),
}).strict();

export const serviceRequestIdempotencySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
