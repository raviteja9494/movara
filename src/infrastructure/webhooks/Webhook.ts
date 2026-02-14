export type WebhookEvent =
  | 'device.created'
  | 'device.updated'
  | 'position.recorded'
  | 'position.received'
  | 'device.online'
  | 'device.offline'
  | 'vehicle.created'
  | 'vehicle.updated'
  | 'maintenance.created'
  | 'maintenance.updated';

export class Webhook {
  constructor(
    readonly id: string,
    readonly url: string,
    readonly events: WebhookEvent[],
    readonly active: boolean,
    readonly createdAt: Date,
    readonly lastTriggeredAt: Date | null,
  ) {}

  static create(url: string, events: WebhookEvent[]): Webhook {
    return new Webhook(
      crypto.randomUUID(),
      url,
      events,
      true,
      new Date(),
      null,
    );
  }

  isSubscribedTo(event: WebhookEvent): boolean {
    return this.events.includes(event);
  }
}
