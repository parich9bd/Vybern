export type NotificationEvent = { id: string; eventType: string; aggregateId: string; payload: unknown };

export interface NotificationProvider {
  deliver(event: NotificationEvent): Promise<void>;
}

/** Development-only boundary. Payloads must already be redacted by callers. */
export class DevelopmentLoggingNotificationProvider implements NotificationProvider {
  constructor(private readonly log: { info: (data: object, message: string) => void }) {}
  async deliver(event: NotificationEvent): Promise<void> {
    this.log.info({ eventId: event.id, eventType: event.eventType, aggregateId: event.aggregateId }, 'Development notification accepted');
  }
}
