import type { FastifyInstance } from 'fastify';
import { requireAuthenticatedUser, requireCsrf } from '../auth/auth.guard.js';
import { cartItemParamsSchema, cartQuerySchema, addCartItemSchema, updateCartItemSchema } from './cart.schemas.js';
import { CartService } from './cart.service.js';

const errorResponse = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' } } } } } as const;
const money = { type: 'object', required: ['amountMinor', 'currency'], additionalProperties: false, properties: { amountMinor: { type: 'integer' }, currency: { type: ['string', 'null'] } } } as const;
const cartResponse = {
  type: 'object', required: ['data'], additionalProperties: false,
  properties: {
    data: {
      type: 'object', required: ['id', 'currency', 'items', 'subtotal', 'total', 'totalItemCount'], additionalProperties: false,
      properties: {
        id: { type: 'string' }, currency: { type: ['string', 'null'] }, totalItemCount: { type: 'integer', minimum: 0 }, subtotal: money, total: money,
        items: { type: 'array', items: { type: 'object', required: ['id', 'quantity', 'availableQuantity', 'available', 'product', 'variant', 'unitPrice', 'lineTotal'], additionalProperties: false, properties: {
          id: { type: 'string' }, quantity: { type: 'integer' }, availableQuantity: { type: 'integer', minimum: 0 }, available: { type: 'boolean' }, unitPrice: money, lineTotal: money,
          product: { type: 'object', required: ['id', 'slug', 'sku', 'name', 'image'], additionalProperties: false, properties: { id: { type: 'string' }, slug: { type: 'string' }, sku: { type: 'string' }, name: { type: ['string', 'null'] }, image: { type: ['object', 'null'], properties: { url: { type: 'string' }, alt: { type: ['string', 'null'] } } } } },
          variant: { type: 'object', required: ['id', 'sku', 'name', 'colour'], additionalProperties: false, properties: { id: { type: 'string' }, sku: { type: 'string' }, name: { type: 'string' }, colour: { type: ['string', 'null'] } } },
        } } },
      },
    },
  },
} as const;
const readResponses = { 200: cartResponse, 401: errorResponse };
const mutationResponses = { 200: cartResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse };

export async function cartRoutes(app: FastifyInstance): Promise<void> {
  const service = new CartService(app.prisma);

  app.get('/cart', {
    schema: { tags: ['Cart'], summary: 'Get the authenticated user cart', security: [{ cookieAuth: [] }], response: readResponses },
  }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const { locale } = cartQuerySchema.parse(request.query);
    return service.get(user.id, locale);
  });

  app.post('/cart/items', {
    schema: {
      tags: ['Cart'], summary: 'Add a purchasable variant to the cart', security: [{ cookieAuth: [] }, { csrfToken: [] }],
      body: { type: 'object', required: ['variantId', 'quantity'], additionalProperties: false, properties: { variantId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 100 } } },
      response: mutationResponses,
    },
  }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { variantId, quantity } = addCartItemSchema.parse(request.body);
    const { locale } = cartQuerySchema.parse(request.query);
    return service.add(user.id, variantId, quantity, locale);
  });

  app.patch('/cart/items/:itemId', {
    schema: {
      tags: ['Cart'], summary: 'Update a cart item quantity', security: [{ cookieAuth: [] }, { csrfToken: [] }],
      body: { type: 'object', required: ['quantity'], additionalProperties: false, properties: { quantity: { type: 'integer', minimum: 1, maximum: 100 } } },
      response: mutationResponses,
    },
  }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { itemId } = cartItemParamsSchema.parse(request.params);
    const { quantity } = updateCartItemSchema.parse(request.body);
    const { locale } = cartQuerySchema.parse(request.query);
    return service.update(user.id, itemId, quantity, locale);
  });

  app.delete('/cart/items/:itemId', {
    schema: { tags: ['Cart'], summary: 'Remove a cart item', security: [{ cookieAuth: [] }, { csrfToken: [] }], response: mutationResponses },
  }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { itemId } = cartItemParamsSchema.parse(request.params);
    const { locale } = cartQuerySchema.parse(request.query);
    return service.remove(user.id, itemId, locale);
  });

  app.delete('/cart', {
    schema: { tags: ['Cart'], summary: 'Clear the authenticated user cart', security: [{ cookieAuth: [] }, { csrfToken: [] }], response: mutationResponses },
  }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { locale } = cartQuerySchema.parse(request.query);
    return service.clear(user.id, locale);
  });
}
