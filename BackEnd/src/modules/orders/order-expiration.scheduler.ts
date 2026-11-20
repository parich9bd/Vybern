import type { FastifyBaseLogger } from 'fastify';
import { OrderService } from './order.service.js';

export async function startOrderExpirationScheduler(service: OrderService, intervalSeconds: number, logger: FastifyBaseLogger): Promise<() => void> {
  let running = false;
  const expire = async () => {
    if (running) return;
    running = true;
    try {
      await service.expirePendingOrders();
    } catch (error) {
      logger.error({ err: error }, 'Order reservation expiration failed');
    } finally {
      running = false;
    }
  };
  await expire();
  const timer = setInterval(() => { void expire(); }, intervalSeconds * 1_000);
  timer.unref();
  return () => clearInterval(timer);
}
