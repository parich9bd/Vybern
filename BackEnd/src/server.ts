import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { OrderService } from './modules/orders/order.service.js';
import { startOrderExpirationScheduler } from './modules/orders/order-expiration.scheduler.js';
import { DevelopmentLoggingNotificationProvider } from './modules/notifications/notification.provider.js';
import { startNotificationWorker } from './modules/notifications/notification-worker.js';

const environment = loadEnvironment();
const app = await buildApp(environment);
const stopOrderExpirationScheduler = await startOrderExpirationScheduler(new OrderService(app.prisma), environment.ORDER_EXPIRATION_INTERVAL_SECONDS, app.log);
app.addHook('onClose', async () => { stopOrderExpirationScheduler(); });
if (environment.NODE_ENV === 'development') {
  const stopNotificationWorker = startNotificationWorker(app.prisma, new DevelopmentLoggingNotificationProvider(app.log), app.log);
  app.addHook('onClose', async () => { stopNotificationWorker(); });
}

try {
  await app.listen({ port: environment.PORT, host: environment.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
