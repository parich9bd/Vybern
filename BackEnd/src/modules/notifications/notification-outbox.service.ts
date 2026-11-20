import { NotificationOutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import type { NotificationEvent, NotificationProvider } from './notification.provider.js';

export const notificationEventTypes = ['ORDER_CREATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'ORDER_CANCELLED', 'ORDER_SHIPPED', 'ORDER_DELIVERED', 'LOW_INVENTORY'] as const;
export type NotificationEventType = (typeof notificationEventTypes)[number];

export class NotificationOutboxService {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueueInTransaction(tx: Prisma.TransactionClient, eventType: NotificationEventType, aggregateId: string, payload: Prisma.InputJsonValue, deduplicationKey?: string): Promise<void> {
    const key = deduplicationKey ?? (eventType === 'LOW_INVENTORY' ? undefined : `${eventType}:${aggregateId}`);
    if (!key) {
      await tx.notificationOutbox.create({ data: { eventType, aggregateId, payload } });
      return;
    }
    await tx.notificationOutbox.upsert({ where: { deduplicationKey: key }, create: { eventType, aggregateId, payload, deduplicationKey: key }, update: {} });
  }

  async recoverAbandoned(now = new Date()): Promise<number> {
    const result = await this.prisma.notificationOutbox.updateMany({
      where: { status: NotificationOutboxStatus.PROCESSING, leaseExpiresAt: { lte: now } },
      data: { status: NotificationOutboxStatus.PENDING, processingAt: null, leaseExpiresAt: null, nextAttemptAt: now },
    });
    return result.count;
  }

  async claim(limit: number, leaseMs: number, now = new Date()) {
    await this.recoverAbandoned(now);
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "NotificationOutbox"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}`;
      if (!events.length) return [];
      await tx.notificationOutbox.updateMany({ where: { id: { in: events.map((event) => event.id) }, status: NotificationOutboxStatus.PENDING }, data: { status: NotificationOutboxStatus.PROCESSING, processingAt: now, leaseExpiresAt } });
      return tx.notificationOutbox.findMany({ where: { id: { in: events.map((event) => event.id) } } });
    });
  }

  async processOnce(provider: NotificationProvider, options: { limit?: number; leaseMs?: number; maxAttempts?: number } = {}): Promise<number> {
    const maxAttempts = options.maxAttempts ?? 5;
    const events = await this.claim(options.limit ?? 20, options.leaseMs ?? 60_000);
    await Promise.all(events.map(async (event) => {
      try {
        await provider.deliver(event as NotificationEvent);
        await this.prisma.notificationOutbox.updateMany({ where: { id: event.id, status: NotificationOutboxStatus.PROCESSING }, data: { status: NotificationOutboxStatus.DELIVERED, deliveredAt: new Date(), leaseExpiresAt: null, lastError: null } });
      } catch (error) {
        const attemptCount = event.attemptCount + 1;
        const failed = attemptCount >= maxAttempts;
        const retryDelay = Math.min(3_600_000, 1_000 * 2 ** (attemptCount - 1));
        await this.prisma.notificationOutbox.updateMany({ where: { id: event.id, status: NotificationOutboxStatus.PROCESSING }, data: { status: failed ? NotificationOutboxStatus.FAILED : NotificationOutboxStatus.PENDING, attemptCount, nextAttemptAt: new Date(Date.now() + retryDelay), processingAt: null, leaseExpiresAt: null, lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Notification delivery failed' } });
      }
    }));
    return events.length;
  }
}
