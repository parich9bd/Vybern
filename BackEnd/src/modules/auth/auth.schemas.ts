import { z } from 'zod';

export const otpRequestSchema = z.object({ phone: z.string().trim().min(3).max(32) });
export const otpVerifySchema = z.object({
  phone: z.string().trim().min(3).max(32),
  code: z.string().regex(/^\d{6}$/, 'OTP code must be exactly six digits'),
});

export function normaliseE164Phone(value: string): string {
  const phone = value.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Phone number must be in E.164 format');
  return phone;
}
