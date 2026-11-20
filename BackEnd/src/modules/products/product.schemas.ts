import { z } from 'zod';

export const supportedLocales = ['en', 'fa', 'de'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const productListQuerySchema = z.object({
  locale: z.enum(supportedLocales).default('en'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  category: z.string().trim().min(1).max(120).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  featured: booleanQuery.optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
});

export const productParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid product slug'),
});

export const categoryListQuerySchema = z.object({
  locale: z.enum(supportedLocales).default('en'),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
