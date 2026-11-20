import 'dotenv/config';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { NotificationOutboxStatus, PrismaClient } from '@prisma/client';
import { NotificationOutboxService } from './notification-outbox.service.js';
import type { NotificationProvider } from './notification.provider.js';

const prisma = new PrismaClient();
const service = new NotificationOutboxService(prisma);
const suffix = `outbox_${Date.now()}`;
const eventIds: string[] = [];

async function enqueue(type: 'ORDER_CREATED' | 'PAYMENT_FAILED', aggregateId: string) {
  await prisma.$transaction((tx) => service.enqueueInTransaction(tx, type, aggregateId, { aggregateId }));
  const event = await prisma.notificationOutbox.findFirstOrThrow({ where: { eventType: type, aggregateId } });
  eventIds.push(event.id);
  return event;
}

afterEach(async () => {
  if (eventIds.length) await prisma.notificationOutbox.deleteMany({ where: { id: { in: eventIds.splice(0) } } });
});
afterAll(async () => { await prisma.$disconnect(); });

describe('Notification outbox PostgreSQL integration', () => {
  it('persists events atomically, rolls back with the transaction and is idempotent', async () => {
    const aggregateId = `${suffix}-atomic`;
    await expect(prisma.$transaction(async (tx) => {
      await service.enqueueInTransaction(tx, 'ORDER_CREATED', aggregateId, { aggregateId });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await prisma.notificationOutbox.count({ where: { aggregateId } })).toBe(0);

    await prisma.$transaction(async (tx) => {
      await service.enqueueInTransaction(tx, 'ORDER_CREATED', aggregateId, { aggregateId });
      await service.enqueueInTransaction(tx, 'ORDER_CREATED', aggregateId, { aggregateId });
    });
    const event = await prisma.notificationOutbox.findFirstOrThrow({ where: { eventType: 'ORDER_CREATED', aggregateId } });
    eventIds.push(event.id);
    expect(await prisma.notificationOutbox.count({ where: { aggregateId } })).toBe(1);
  });

  it('allows distinct low-inventory notifications for the same variant', async () => {
    const aggregateId = `${suffix}-variant`;
    await prisma.$transaction(async (tx) => {
      await service.enqueueInTransaction(tx, 'LOW_INVENTORY', aggregateId, { remaining: 2 });
      await service.enqueueInTransaction(tx, 'LOW_INVENTORY', aggregateId, { remaining: 1 });
    });
    const events = await prisma.notificationOutbox.findMany({ where: { eventType: 'LOW_INVENTORY', aggregateId } });
    eventIds.push(...events.map((event) => event.id));
    expect(events).toHaveLength(2);
  });

  it('allows concurrent workers to claim an event only once', async () => {
    const event = await enqueue('ORDER_CREATED', `${suffix}-concurrent`);
    const delivered: string[] = [];
    const provider: NotificationProvider = { async deliver(item) { delivered.push(item.id); } };
    await Promise.all([service.processOnce(provider, { limit: 1_000 }), service.processOnce(provider, { limit: 1_000 })]);
    expect(delivered.filter((id) => id === event.id)).toHaveLength(1);
    expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: NotificationOutboxStatus.DELIVERED, attemptCount: 0 });
  });

  it('schedules exponential retries and permanently fails after the retry bound', async () => {
    const event = await enqueue('PAYMENT_FAILED', `${suffix}-retry`);
    const failing: NotificationProvider = { async deliver() { throw new Error('provider unavailable'); } };
    await service.processOnce(failing, { maxAttempts: 2 });
    const pending = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: event.id } });
    expect(pending).toMatchObject({ status: NotificationOutboxStatus.PENDING, attemptCount: 1, lastError: 'provider unavailable' });
    await prisma.notificationOutbox.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(Date.now() - 1) } });
    await service.processOnce(failing, { maxAttempts: 2 });
    expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: NotificationOutboxStatus.FAILED, attemptCount: 2 });
  });

  it('recovers abandoned processing leases before claiming work', async () => {
    const event = await enqueue('ORDER_CREATED', `${suffix}-lease`);
    await prisma.notificationOutbox.update({ where: { id: event.id }, data: { status: NotificationOutboxStatus.PROCESSING, processingAt: new Date(Date.now() - 60_000), leaseExpiresAt: new Date(Date.now() - 1) } });
    const delivered: string[] = [];
    await service.processOnce({ async deliver(item) { delivered.push(item.id); } });
    expect(delivered).toEqual([event.id]);
    expect(await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: NotificationOutboxStatus.DELIVERED });
  });
});
