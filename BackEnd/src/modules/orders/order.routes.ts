import type { FastifyInstance } from 'fastify';
import { requireAuthenticatedUser, requireCsrf } from '../auth/auth.guard.js';
import { normaliseE164Phone } from '../auth/auth.schemas.js';
import { AppError } from '../../lib/errors.js';
import { checkoutSchema, idempotencyKeySchema, orderListQuerySchema, orderParamsSchema } from './order.schemas.js';
import { OrderService } from './order.service.js';

const errorResponse = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' } } } } } as const;
const money = { type: 'object', required: ['amountMinor', 'currency'], additionalProperties: false, properties: { amountMinor: { type: 'integer' }, currency: { type: 'string' } } } as const;
const orderSchema = { type: 'object', required: ['id', 'status', 'currency', 'subtotal', 'discount', 'shipping', 'total', 'discountCode', 'shippingMethod', 'deliveryEstimateDays', 'reservationExpiresAt', 'shippingAddress', 'items', 'createdAt'], additionalProperties: false, properties: {
  id: { type: 'string' }, status: { type: 'string' }, currency: { type: 'string' }, subtotal: money, discount: money, shipping: money, total: money, discountCode: { type: ['string', 'null'] }, shippingMethod: { type: ['string', 'null'] }, deliveryEstimateDays: { type: ['integer', 'null'] }, reservationExpiresAt: { type: ['string', 'null'], format: 'date-time' }, createdAt: { type: 'string', format: 'date-time' },
  shippingAddress: { type: ['object', 'null'], required: ['firstName', 'lastName', 'phone', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'countryCode'], additionalProperties: false, properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' }, addressLine1: { type: 'string' }, addressLine2: { type: ['string', 'null'] }, city: { type: 'string' }, region: { type: ['string', 'null'] }, postalCode: { type: 'string' }, countryCode: { type: 'string' } } },
  items: { type: 'array', items: { type: 'object', required: ['id', 'quantity', 'product', 'variant', 'unitPrice', 'lineTotal'], additionalProperties: false, properties: { id: { type: 'string' }, quantity: { type: 'integer' }, product: { type: 'object', required: ['id', 'slug', 'sku', 'name'], additionalProperties: false, properties: { id: { type: ['string', 'null'] }, slug: { type: 'string' }, sku: { type: 'string' }, name: { type: 'string' } } }, variant: { type: 'object', required: ['id', 'sku', 'name', 'colour'], additionalProperties: false, properties: { id: { type: ['string', 'null'] }, sku: { type: 'string' }, name: { type: 'string' }, colour: { type: ['string', 'null'] } } }, unitPrice: money, lineTotal: money } } },
} } as const;
const meta = { type: 'object', required: ['page', 'limit', 'total', 'totalPages'], additionalProperties: false, properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } as const;

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  const service = new OrderService(app.prisma);

  app.post('/orders', {
    schema: {
      tags: ['Orders'], summary: 'Create an order from the authenticated user cart', security: [{ cookieAuth: [] }, { csrfToken: [] }],
      headers: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 } } },
      body: { type: 'object', oneOf: [{ required: ['shippingAddress'] }, { required: ['shippingAddressId'] }], additionalProperties: false, properties: { shippingAddressId: { type: 'string', minLength: 1, maxLength: 32 }, discountCode: { type: 'string', minLength: 1, maxLength: 64 }, shippingAddress: { type: 'object', required: ['firstName', 'lastName', 'phone', 'addressLine1', 'city', 'region', 'postalCode', 'countryCode'], additionalProperties: false, properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' }, addressLine1: { type: 'string' }, addressLine2: { type: 'string' }, city: { type: 'string' }, region: { type: 'string' }, postalCode: { type: 'string' }, countryCode: { const: 'IR' } } } } },
      response: { 201: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: orderSchema } }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
  }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const header = request.headers['idempotency-key'];
    const idempotencyKey = idempotencyKeySchema.parse(typeof header === 'string' ? header : '');
    const { shippingAddress, shippingAddressId, discountCode } = checkoutSchema.parse(request.body);
    if (shippingAddressId) {
      const order = await service.checkout(user.id, idempotencyKey, undefined, discountCode, shippingAddressId);
      return reply.status(201).send(order);
    }
    if (!shippingAddress) throw new AppError(400, 'SHIPPING_ADDRESS_REQUIRED', 'Shipping address is required');
    let phone: string;
    try { phone = normaliseE164Phone(shippingAddress.phone); } catch { throw new AppError(400, 'VALIDATION_ERROR', 'Shipping phone must be in E.164 format'); }
    const order = await service.checkout(user.id, idempotencyKey, { ...shippingAddress, phone }, discountCode);
    return reply.status(201).send(order);
  });

  app.get('/orders', {
    schema: { tags: ['Orders'], summary: 'List orders for the authenticated user', security: [{ cookieAuth: [] }], response: { 200: { type: 'object', required: ['data', 'meta'], additionalProperties: false, properties: { data: { type: 'array', items: orderSchema }, meta } }, 401: errorResponse } },
  }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const { page, limit } = orderListQuerySchema.parse(request.query);
    return service.list(user.id, page, limit);
  });

  app.get('/orders/:orderId', {
    schema: { tags: ['Orders'], summary: 'Get an order owned by the authenticated user', security: [{ cookieAuth: [] }], response: { 200: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: orderSchema } }, 401: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const { orderId } = orderParamsSchema.parse(request.params);
    return service.getById(user.id, orderId);
  });
}
