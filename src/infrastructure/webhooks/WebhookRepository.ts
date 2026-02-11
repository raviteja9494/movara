import { Webhook, WebhookEvent } from './Webhook';

export interface WebhookRepository {
  register(webhook: Webhook): Promise<Webhook>;
  unregister(id: string): Promise<void>;
  findAll(): Promise<Webhook[]>;
  findByEvent(event: WebhookEvent): Promise<Webhook[]>;
  updateLastTriggered(id: string, timestamp: Date): Promise<void>;
}
