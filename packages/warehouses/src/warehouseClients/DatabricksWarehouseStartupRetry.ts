import HiveDriverError from '@databricks/sql/dist/errors/HiveDriverError';
import OperationStateError from '@databricks/sql/dist/errors/OperationStateError';
import StatusError from '@databricks/sql/dist/errors/StatusError';

// The driver surfaces server errors with no usable code, so the message is the only
// signal. Explicit allowlist so auth, permission and SQL errors fail fast.
const DATABRICKS_WAREHOUSE_STARTING_MESSAGES: readonly RegExp[] = [
    // Pro/classic: OpenSession succeeds while stopped, then every op is rejected
    /Session handle: SessionHandle \[[^\]]*\] has not been initialized or had already closed/,
    // Cluster nodes still booting when the session is initialised
    /Couldn't create directory \/local_disk0\//,
    /is not ready to accept connections \(current state: STARTING\)/,
    // Pro/classic STARTING: 503 until up; the driver gives up after ~30s of HTTP retries
    /^Hive driver: 503 when connecting to resource/,
];

export const isDatabricksWarehouseStartingError = (
    error: unknown,
): error is StatusError | HiveDriverError =>
    (error instanceof StatusError ||
        error instanceof OperationStateError ||
        error instanceof HiveDriverError) &&
    DATABRICKS_WAREHOUSE_STARTING_MESSAGES.some((pattern) =>
        pattern.test(error.message),
    );

// Serverless starts in seconds; pro/classic take minutes and can be "Start-up Delayed".
// The deadline is wall clock from the first failure, since each attempt also spends
// time inside the driver's own HTTP retries.
export const DATABRICKS_WAREHOUSE_STARTUP_RETRY = {
    initialDelayMs: 2_000,
    maxDelayMs: 30_000,
    deadlineMs: 600_000,
} as const;

/** Delay before retry `attempt` (1-based), or null once the deadline would pass. */
export const getDatabricksWarehouseStartupRetryDelayMs = (
    attempt: number,
    elapsedMs: number,
): number | null => {
    const { initialDelayMs, maxDelayMs, deadlineMs } =
        DATABRICKS_WAREHOUSE_STARTUP_RETRY;
    const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
    return elapsedMs + delayMs <= deadlineMs ? delayMs : null;
};

const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/** One retry budget, shared across every session opened for a single operation. */
export class DatabricksWarehouseStartupRetry {
    private attempt = 0;

    private firstFailureAt: number | null = null;

    /** Waits with backoff if the error is a warehouse startup error and budget remains. */
    async waitBeforeRetry(error: unknown): Promise<boolean> {
        if (!isDatabricksWarehouseStartingError(error)) return false;
        this.firstFailureAt = this.firstFailureAt ?? Date.now();
        const elapsedMs = Date.now() - this.firstFailureAt;
        const delayMs = getDatabricksWarehouseStartupRetryDelayMs(
            this.attempt + 1,
            elapsedMs,
        );
        if (delayMs === null) return false;

        this.attempt += 1;
        console.warn(
            `Databricks SQL warehouse is not ready (${error.message}). Waiting ${
                delayMs / 1000
            }s before retry ${this.attempt} (${Math.round(elapsedMs / 1000)}s of ${
                DATABRICKS_WAREHOUSE_STARTUP_RETRY.deadlineMs / 1000
            }s deadline used)`,
        );
        await sleep(delayMs);
        return true;
    }
}
