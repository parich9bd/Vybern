import type { PrismaClient } from '@prisma/client';
import type { NotificationProvider } from './notification.provider.js';
import { NotificationOutboxService } from './notification-outbox.service.js';

type Logger = { info: (data: object, message: string) => void; error: (data: object, message: string) => void };

export function startNotificationWorker(
  prisma: PrismaClient,
  provider: NotificationProvider,
  logger: Logger,
  intervalSeconds = 10,
): () => void {
  const outbox = new NotificationOutboxService(prisma);
  let processing = false;
  const tick = async () => {
    if (processing) return;
    processing = true;
    try {
      const processed = await outbox.processOnce(provider);
      if (processed) logger.info({ processed }, 'Notification outbox batch processed');
    } catch (error) {
      logger.error({ err: error }, 'Notification outbox worker failed');
    } finally {
      processing = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, Math.max(1, intervalSeconds) * 1_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
