import { z } from 'zod';
import { supportedLocales } from '../products/product.schemas.js';

const id = z.string().min(1).max(32);
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const sku = z.string().trim().min(1).max(64);
const currency = z.string().trim().regex(/^[A-Z]{3}$/);
const translations = z.array(z.object({ locale: z.enum(supportedLocales), name: z.string().trim().min(1).max(180), description: z.string().trim().max(10_000).optional(), material: z.string().trim().max(120).optional() })).min(1)
  .refine((items) => new Set(items.map((item) => item.locale)).size === items.length, 'Locales must be unique');

export const createCategorySchema = z.object({ slug: slug.max(120), position: z.coerce.number().int().min(0).max(10000).default(0), translations: z.array(z.object({ locale: z.enum(supportedLocales), name: z.string().trim().min(1).max(120) })).min(1) });
export const updateCategorySchema = createCategorySchema.partial();
export const createProductSchema = z.object({
  slug, sku, categoryId: id, basePriceMinor: z.coerce.number().int().min(0), currency, isFeatured: z.boolean().optional(),
  specifications: z.record(z.string(), z.unknown()).optional(), translations,
});
export const updateProductSchema = createProductSchema.omit({ translations: true }).partial().extend({ translations: translations.optional() });
export const createVariantSchema = z.object({ sku, name: z.string().trim().min(1).max(120), colour: z.string().trim().max(80).optional(), priceMinor: z.coerce.number().int().min(0).optional(), stockOnHand: z.coerce.number().int().min(0).default(0), isActive: z.boolean().optional() });
export const updateVariantSchema = createVariantSchema.omit({ stockOnHand: true }).partial();
export const inventoryAdjustSchema = z.object({ type: z.enum(['ADJUSTMENT', 'RECEIPT', 'DAMAGE', 'RETURN']), quantityDelta: z.coerce.number().int().refine((value) => value !== 0), reason: z.string().trim().min(3).max(200), note: z.string().trim().max(500).optional() });
export const paramsSchema = z.object({ id });
export const variantParamsSchema = z.object({ variantId: id });
