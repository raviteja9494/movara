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

    // Fire-and-forget delivery: do not block caller. Each delivery
    // runs with timeout protection and limited retries.
    for (const webhook of webhooks) {
      if (!webhook.active) continue;
      // Intentionally do not await; swallow rejections inside deliverWebhook
      void this.deliverWebhook(webhook, payload).catch(() => {});
    }
  }

  private async deliverWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
  ): Promise<void> {
    const MAX_RETRIES = 2; // max retries after initial attempt
    const TIMEOUT_MS = 3000; // per-request timeout

    const body = JSON.stringify(payload);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          // successful delivery
          try {
            await this.repository.updateLastTriggered(webhook.id, new Date());
          } catch {
            // ignore repo update failures
          }
          return;
        } else {
          // non-2xx response -> may retry
          // allow exponential backoff below
        }
      } catch (err) {
        // fetch failed or timed out - retry according to attempts
      } finally {
        clearTimeout(timeout);
      }

      // Retry backoff (do not block other operations heavily)
      const backoffMs = 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
    }

    // All attempts failed — swallow errors (fire-and-forget). Logging
    // should be handled by caller environment if needed.
  }
}
