export type RetentionCleanupOptions = {
    batchSize: number;
    delayMs: number;
    maxBatches: number;
};

export type RetentionCleanupResult = {
    totalDeleted: number;
    batchCount: number;
    // false when the run stopped at the batch cap with expired rows still present
    completed: boolean;
};

// Pausing for at least as long as the batch took keeps the job below half of
// one connection's time however slow the database is
export const pauseBetweenBatchesMs = (
    { delayMs }: RetentionCleanupOptions,
    batchDurationMs: number,
): number => Math.max(delayMs, batchDurationMs);
