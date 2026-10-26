import type { RetentionUseCase } from './RetentionUseCase';
import type { RetentionSettings } from '../../../shared/runtimeSettings/RuntimeSettingsStore';

const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class RetentionScheduler {
  private firstRunTimer: NodeJS.Timeout | null = null;
  private dailyTimer: NodeJS.Timeout | null = null;
  private running = false;
  private started = false;

  constructor(
    private readonly useCase: RetentionUseCase,
    private readonly getSettings: () => RetentionSettings,
    private readonly logger: Pick<Console, 'info' | 'error'> = console,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.firstRunTimer = setTimeout(() => {
      this.firstRunTimer = null;
      void this.runIfEnabled().finally(() => {
        if (this.started && !this.dailyTimer) {
          this.dailyTimer = setInterval(() => { void this.runIfEnabled(); }, DAILY_INTERVAL_MS);
          this.dailyTimer.unref();
        }
      });
    }, FIRST_RUN_DELAY_MS);
    this.firstRunTimer.unref();
  }

  stop(): void {
    this.started = false;
    if (this.firstRunTimer) clearTimeout(this.firstRunTimer);
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    this.firstRunTimer = null;
    this.dailyTimer = null;
  }

  async runIfEnabled(): Promise<void> {
    const settings = this.getSettings();
    if (!settings.enabled || this.running) return;
    this.running = true;
    try {
      const result = await this.useCase.run(settings.days);
      this.logger.info(
        `Retention run complete: trips=${result.counts.trips}, positions=${result.counts.positions}, tripMerges=${result.counts.tripMerges}, deviceCommands=${result.counts.deviceCommands}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Retention run failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
