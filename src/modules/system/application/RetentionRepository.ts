export interface RetentionCounts {
  trips: number;
  tripPositions: number;
  tripStops: number;
  positions: number;
  tripMerges: number;
  deviceCommands: number;
}

export interface RetentionOldestRemaining {
  positions: Date | null;
  trips: Date | null;
  tripMerges: Date | null;
  deviceCommands: Date | null;
}

export interface RetentionResult {
  cutoffAt: string;
  counts: RetentionCounts;
  oldestRemaining: RetentionOldestRemaining;
}

export interface RetentionRepository {
  preview(cutoff: Date): Promise<RetentionResult>;
  run(cutoff: Date): Promise<RetentionResult>;
}

export interface RetentionRunHistory {
  saveLastRun(summary: { completedAt: string; cutoffAt: string; counts: Record<string, number> }): Promise<void>;
}
