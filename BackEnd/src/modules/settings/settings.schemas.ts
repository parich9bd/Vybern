import { z } from 'zod';

const languageSchema = z.enum(['en', 'fa', 'de']);

export const updateStoreSettingsSchema = z.object({
  storeName: z.string().trim().min(1).max(160).optional(),
  storeDescription: z.string().trim().max(2000).nullable().optional(),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
  contactPhone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
  supportInfo: z.string().trim().max(2000).nullable().optional(),
  supportedLanguages: z.array(languageSchema).min(1).max(3).optional(),
  defaultLanguage: languageSchema.optional(),
  defaultCurrency: z.literal('IRR').optional(),
  maintenanceMode: z.boolean().optional(),
  seoTitle: z.string().trim().max(160).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
}).superRefine((input, context) => {
  if (input.defaultLanguage && input.supportedLanguages && !input.supportedLanguages.includes(input.defaultLanguage)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultLanguage'], message: 'Default language must be supported' });
  }
});
