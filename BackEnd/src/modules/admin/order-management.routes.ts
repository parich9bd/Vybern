import type { FastifyInstance, FastifySchema } from 'fastify';
import { requireCsrf } from '../auth/auth.guard.js';
import { requireAdminPermission } from './admin.guard.js';
import { AuditService } from './audit.service.js';
import { AdminOrderManagementService } from './order-management.service.js';
import { adminOrderListQuerySchema, customerListQuerySchema, customerParamsSchema, fulfillmentSchema, orderNoteSchema, orderParamsSchema, paymentListQuerySchema, paymentParamsSchema } from './order-management.schemas.js';

export async function orderManagementAdminRoutes(app: FastifyInstance): Promise<void> {
  const service = new AdminOrderManagementService(app.prisma);
  const audit = new AuditService(app.prisma);
  const readSchema: FastifySchema = { tags: ['Administration'], security: [{ cookieAuth: [] }] };
  const mutationSchema: FastifySchema = { tags: ['Administration'], security: [{ cookieAuth: [] }, { csrfToken: [] }] };

  app.get('/admin/orders', { schema: { ...readSchema, summary: 'List orders for administration' } }, async (request) => {
    await requireAdminPermission(app, request, 'ORDER_READ');
    return service.listOrders(adminOrderListQuerySchema.parse(request.query));
  });

  app.get('/admin/orders/:orderId', { schema: { ...readSchema, summary: 'Get order details for administration' } }, async (request) => {
    await requireAdminPermission(app, request, 'ORDER_READ');
    return service.getOrder(orderParamsSchema.parse(request.params).orderId);
  });

  app.post('/admin/orders/:orderId/fulfillment', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { ...mutationSchema, summary: 'Advance paid order fulfilment' } }, async (request) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'ORDER_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { orderId } = orderParamsSchema.parse(request.params);
    const input = fulfillmentSchema.parse(request.body);
    const result = await service.transitionFulfillment(orderId, input.status, input.trackingNumber);
    await audit.record(user.id, 'ORDER_FULFILLMENT_UPDATED', 'Order', request, orderId, { fulfillmentStatus: input.status });
    return result;
  });

  app.post('/admin/orders/:orderId/notes', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { ...mutationSchema, summary: 'Add internal order note' } }, async (request, reply) => {
    const { auth, user, csrfTokenHash } = await requireAdminPermission(app, request, 'ORDER_MANAGE');
    requireCsrf(auth, csrfTokenHash, request);
    const { orderId } = orderParamsSchema.parse(request.params);
    const { body } = orderNoteSchema.parse(request.body);
    const note = await service.addInternalNote(orderId, user.id, body);
    await audit.record(user.id, 'ORDER_INTERNAL_NOTE_ADDED', 'Order', request, orderId);
    return reply.status(201).send({ data: { ...note, createdAt: note.createdAt.toISOString() } });
  });

  app.get('/admin/customers', { schema: { ...readSchema, summary: 'List customers for administration' } }, async (request) => {
    await requireAdminPermission(app, request, 'CUSTOMER_READ');
    return service.listCustomers(customerListQuerySchema.parse(request.query));
  });

  app.get('/admin/customers/:customerId', { schema: { ...readSchema, summary: 'Get customer account and order history' } }, async (request) => {
    await requireAdminPermission(app, request, 'CUSTOMER_READ');
    return service.getCustomer(customerParamsSchema.parse(request.params).customerId);
  });

  app.get('/admin/payments', { schema: { ...readSchema, summary: 'Read-only payment monitoring list' } }, async (request) => {
    await requireAdminPermission(app, request, 'PAYMENT_READ');
    return service.listPayments(paymentListQuerySchema.parse(request.query));
  });

  app.get('/admin/payments/:paymentId', { schema: { ...readSchema, summary: 'Read-only payment and attempt history' } }, async (request) => {
    await requireAdminPermission(app, request, 'PAYMENT_READ');
    return service.getPayment(paymentParamsSchema.parse(request.params).paymentId);
  });
}
