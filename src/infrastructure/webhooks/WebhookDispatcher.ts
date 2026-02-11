import { Webhook, WebhookEvent } from './Webhook';
import { WebhookRepository } from './WebhookRepository';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  data: unknown;
}

export class WebhookDispatcher {
  constructor(private repository: WebhookRepository) {}

  async dispatch(event: WebhookEvent, data: unknown): Promise<void> {
    const webhooks = await this.repository.findByEvent(event);
    const payload: WebhookPayload = {
      event,
      timestamp: new Date(),
      data,
    };

    // TODO: Implement delivery
    // - Fetch active webhooks subscribed to this event
    // - Send POST requests with exponential backoff
    // - Update lastTriggeredAt on successful delivery
    // - Log failures without blocking

    for (const webhook of webhooks) {
      if (webhook.active) {
        await this.deliverWebhook(webhook, payload);
      }
    }
  }

  private async deliverWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<void> {
    // TODO: Implement HTTP POST delivery with retry logic
    // For now, this is a skeleton
  }
}
