import type { RetentionRepository, RetentionResult, RetentionRunHistory } from './RetentionRepository';

export class RetentionUseCase {
  constructor(
    private readonly repository: RetentionRepository,
    private readonly runHistory: RetentionRunHistory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async preview(days: number): Promise<RetentionResult> {
    return this.repository.preview(this.cutoff(days));
  }

  async run(days: number): Promise<RetentionResult> {
    const result = await this.repository.run(this.cutoff(days));
    await this.runHistory.saveLastRun({
      completedAt: this.now().toISOString(),
      cutoffAt: result.cutoffAt,
      counts: { ...result.counts },
    });
    return result;
  }

  private cutoff(days: number): Date {
    return new Date(this.now().getTime() - days * 24 * 60 * 60 * 1000);
  }
}
