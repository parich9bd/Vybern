import { z } from 'zod';

const id = z.string().min(1).max(32);
const alt = z.string().trim().min(1).max(255);
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(25);

export const mediaParamsSchema = z.object({ mediaId: id });
export const productMediaParamsSchema = z.object({ productId: id, imageId: id });
export const productParamsSchema = z.object({ productId: id });
export const mediaListQuerySchema = z.object({ page, limit, includeDeleted: z.coerce.boolean().default(false) });
export const mediaMetadataSchema = z.object({ altText: z.object({ en: alt.optional(), fa: alt.optional(), de: alt.optional() }).strict() }).strict();
export const assignMediaSchema = z.object({ mediaAssetId: id }).strict();
export const reorderImagesSchema = z.object({ imageIds: z.array(id).min(1).max(100).refine((items) => new Set(items).size === items.length, 'Image IDs must be unique') }).strict();
