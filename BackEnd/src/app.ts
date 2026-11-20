import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Environment } from './config/env.js';
import { errorPayload } from './lib/errors.js';
import { createPrismaClient } from './lib/prisma.js';
import { connectRedisStore, createRedisStore, type KeyValueStore } from './lib/redis.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { catalogAdminRoutes } from './modules/admin/catalog.routes.js';
import { orderManagementAdminRoutes } from './modules/admin/order-management.routes.js';
import { DevelopmentSmsProvider, UnconfiguredSmsProvider, type SmsProvider } from './modules/auth/sms.provider.js';
import { cartRoutes } from './modules/cart/cart.routes.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import { MockPaymentProvider, UnconfiguredPaymentProvider, type PaymentProvider } from './modules/payments/payment.provider.js';
import { paymentRoutes } from './modules/payments/payment.routes.js';
import { productRoutes } from './modules/products/product.routes.js';
import { LocalMediaStorage, type MediaStorage } from './modules/media/media.storage.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { customerRoutes } from './modules/customer/customer.routes.js';
import { shippingRoutes } from './modules/shipping/shipping.routes.js';
import { discountRoutes } from './modules/discounts/discount.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { adminUserManagementRoutes } from './modules/admin/user-management.routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: KeyValueStore;
    smsProvider: SmsProvider;
    environment: Environment;
    paymentProvider: PaymentProvider;
    mediaStorage: MediaStorage;
  }
}

export async function buildApp(
  environment: Environment,
  prisma: PrismaClient = createPrismaClient(),
  redis: KeyValueStore = createRedisStore(environment.REDIS_URL),
  smsProvider: SmsProvider = environment.SMS_PROVIDER === 'development' ? new DevelopmentSmsProvider() : new UnconfiguredSmsProvider(),
  paymentProvider: PaymentProvider = environment.NODE_ENV === 'development' && environment.PAYMENT_PROVIDER === 'mock' ? new MockPaymentProvider() : new UnconfiguredPaymentProvider(),
  mediaStorage: MediaStorage = new LocalMediaStorage(environment.MEDIA_STORAGE_PATH),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: environment.LOG_LEVEL, redact: { paths: ['req.headers.cookie', 'req.headers.idempotency-key', 'req.body.code', 'res.headers.set-cookie'], censor: '[REDACTED]' } } });
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);
  app.decorate('smsProvider', smsProvider);
  app.decorate('environment', environment);
  app.decorate('paymentProvider', paymentProvider);
  app.decorate('mediaStorage', mediaStorage);
  await connectRedisStore(redis);
  await app.register(cookie);
  await app.register(multipart, { limits: { files: 1, fileSize: environment.MEDIA_MAX_FILE_SIZE_BYTES } });
  await app.register(helmet, { contentSecurityPolicy: environment.NODE_ENV === 'production' ? undefined : false });
  await app.register(cors, {
    origin: environment.CORS_ORIGIN ?? false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: { title: 'VYBERN Eyewear API', version: '1.0.0' },
      servers: [{ url: '/api/v1' }],
      components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: environment.AUTH_COOKIE_NAME }, csrfToken: { type: 'apiKey', in: 'header', name: 'x-csrf-token' } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error, request, reply) => {
    const result = errorPayload(error);
    if (result.statusCode >= 500) request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/api/v1/health', { schema: { tags: ['System'], summary: 'Service health check' } }, async () => ({ data: { status: 'ok' } }));
  app.get('/api/v1/ready', { schema: { tags: ['System'], summary: 'Dependency readiness check' } }, async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      await app.redis.get('system:readiness');
      return { data: { status: 'ready' } };
    } catch {
      return reply.status(503).send({ error: { code: 'NOT_READY', message: 'Service dependencies are unavailable' } });
    }
  });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  await app.register(catalogAdminRoutes, { prefix: '/api/v1' });
  await app.register(orderManagementAdminRoutes, { prefix: '/api/v1' });
  await app.register(cartRoutes, { prefix: '/api/v1' });
  await app.register(orderRoutes, { prefix: '/api/v1' });
  await app.register(paymentRoutes, { prefix: '/api/v1' });
  await app.register(mediaRoutes, { prefix: '/api/v1' });
  await app.register(customerRoutes, { prefix: '/api/v1' });
  await app.register(shippingRoutes, { prefix: '/api/v1' });
  await app.register(discountRoutes, { prefix: '/api/v1' });
  await app.register(settingsRoutes, { prefix: '/api/v1' });
  await app.register(adminUserManagementRoutes, { prefix: '/api/v1' });
  await app.register(productRoutes, { prefix: '/api/v1' });
  app.addHook('onClose', async () => { await Promise.all([prisma.$disconnect(), redis.close()]); });
  return app;
}
