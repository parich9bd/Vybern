import { z } from 'zod';
import { supportedLocales } from '../products/product.schemas.js';

const id = z.string().min(1).max(32);
const quantity = z.coerce.number().int().min(1).max(100);

export const cartQuerySchema = z.object({ locale: z.enum(supportedLocales).default('en') });
export const addCartItemSchema = z.object({ variantId: id, quantity });
export const updateCartItemSchema = z.object({ quantity });
export const cartItemParamsSchema = z.object({ itemId: id });
