import type { FastifyInstance } from 'fastify';
import { requireAuthenticatedUser, requireCsrf } from '../auth/auth.guard.js';
import { initiatePaymentSchema, mockPaymentActionSchema, paymentParamsSchema } from './payment.schemas.js';
import { PaymentService } from './payment.service.js';

const errorResponse = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' } } } } } as const;
const paymentResponse = { type: 'object', required: ['data'], additionalProperties: false, properties: { data: { type: 'object', required: ['id', 'orderId', 'provider', 'status', 'amount', 'expiresAt', 'verifiedAt', 'createdAt'], additionalProperties: false, properties: { id: { type: 'string' }, orderId: { type: 'string' }, provider: { type: 'string' }, status: { type: 'string' }, amount: { type: 'object', required: ['amountMinor', 'currency'], additionalProperties: false, properties: { amountMinor: { type: 'integer' }, currency: { type: 'string' } } }, expiresAt: { type: ['string', 'null'], format: 'date-time' }, verifiedAt: { type: ['string', 'null'], format: 'date-time' }, createdAt: { type: 'string', format: 'date-time' } } } } } as const;
const mutationResponses = { 200: paymentResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 503: errorResponse };

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const service = new PaymentService(app.prisma, app.paymentProvider, app.environment.NODE_ENV === 'development');

  app.post('/payments', {
    schema: {
      tags: ['Payments'], summary: 'Initiate a payment for an owned pending order', security: [{ cookieAuth: [] }, { csrfToken: [] }],
      body: { type: 'object', required: ['orderId'], additionalProperties: false, properties: { orderId: { type: 'string' } } },
      response: { 201: paymentResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 503: errorResponse },
    },
  }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { orderId } = initiatePaymentSchema.parse(request.body);
    return reply.status(201).send(await service.initiate(user.id, orderId));
  });

  app.get('/payments/:paymentId', {
    schema: { tags: ['Payments'], summary: 'Get an owned payment status', security: [{ cookieAuth: [] }], response: { 200: paymentResponse, 401: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const { user } = await requireAuthenticatedUser(app, request);
    const { paymentId } = paymentParamsSchema.parse(request.params);
    return service.get(user.id, paymentId);
  });

  app.post('/payments/:paymentId/mock', {
    schema: {
      tags: ['Payments'], summary: 'Development-only simulated mock payment action', security: [{ cookieAuth: [] }, { csrfToken: [] }],
      body: { type: 'object', required: ['action'], additionalProperties: false, properties: { action: { type: 'string', enum: ['success', 'fail', 'cancel'] } } },
      response: mutationResponses,
    },
  }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAuthenticatedUser(app, request);
    requireCsrf(auth, csrfTokenHash, request);
    const { paymentId } = paymentParamsSchema.parse(request.params);
    const { action } = mockPaymentActionSchema.parse(request.body);
    return service.mockAction(user.id, paymentId, action);
  });
}
