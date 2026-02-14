import { Webhook, WebhookEvent } from './Webhook';
import { WebhookRepository } from './WebhookRepository';

export class InMemoryWebhookRepository implements WebhookRepository {
  private webhooks: Webhook[] = [];

  async register(webhook: Webhook): Promise<Webhook> {
    this.webhooks.push(webhook);
    return webhook;
  }

  async unregister(id: string): Promise<void> {
    this.webhooks = this.webhooks.filter((w) => w.id !== id);
  }

  async findAll(): Promise<Webhook[]> {
    return [...this.webhooks];
  }

  async findByEvent(event: WebhookEvent): Promise<Webhook[]> {
    return this.webhooks.filter((w) => w.active && w.events.includes(event));
  }

  async updateLastTriggered(id: string, timestamp: Date): Promise<void> {
    const idx = this.webhooks.findIndex((w) => w.id === id);
    if (idx !== -1) this.webhooks[idx] = new Webhook(
      this.webhooks[idx].id,
      this.webhooks[idx].url,
      this.webhooks[idx].events,
      this.webhooks[idx].active,
      this.webhooks[idx].createdAt,
      timestamp,
    );
  }
}
