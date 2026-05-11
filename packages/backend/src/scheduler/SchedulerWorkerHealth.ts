import Logger from '../logging/logger';

const LISTEN_RECOVERY_BUDGET_MS = 60_000;

const JOB_ACTIVITY_STALENESS_MS = 3 * 60_000;

// Per-pod unique poolId — replicas sharing one would collapse to a single dedup'd heartbeat row,
// leaving all but the lock-winning replica's activity clock to age past staleness.
export const derivePoolIdFromEnv = (
    env: NodeJS.ProcessEnv = process.env,
): string | undefined =>
    env.K8S_POD_NAME || env.POD_NAME || env.HOSTNAME || undefined;

export type HealthState = 'starting' | 'healthy' | 'unhealthy';

export type HealthCheckResult = { ok: boolean; reason?: string };

export class SchedulerWorkerHealth {
    private readonly poolId: string;

    private lastListenSuccessAt: number | null = null;

    private listenLostAt: number | null = null;

    private lastJobActivityAt: number | null = null;

    private inFlightJobCount: number = 0;

    private startedAt: number = Date.now();

    private lastReportedState: HealthState = 'starting';

    constructor(poolId?: string) {
        this.poolId = poolId ?? Math.random().toString(36).slice(2, 10);
        Logger.info(
            `[scheduler-health] initialized poolId=${this.poolId} startedAt=${new Date(
                this.startedAt,
            ).toISOString()} listenBudgetMs=${LISTEN_RECOVERY_BUDGET_MS} activityStalenessMs=${JOB_ACTIVITY_STALENESS_MS}`,
        );
    }

    getPoolId(): string {
        return this.poolId;
    }

    markListenUp() {
        const wasLost = this.listenLostAt !== null;
        const downForMs = wasLost ? Date.now() - this.listenLostAt! : 0;
        this.lastListenSuccessAt = Date.now();
        this.listenLostAt = null;
        if (wasLost) {
            Logger.info(
                `[scheduler-health] LISTEN recovered poolId=${this.poolId} downForMs=${downForMs}`,
            );
        }
    }

    markListenLost() {
        if (this.listenLostAt === null) {
            this.listenLostAt = Date.now();
            Logger.warn(
                `[scheduler-health] LISTEN lost poolId=${this.poolId} at=${new Date(
                    this.listenLostAt,
                ).toISOString()} budgetMs=${LISTEN_RECOVERY_BUDGET_MS}`,
            );
        }
    }

    markJobActivity() {
        const now = Date.now();
        const ageMs =
            this.lastJobActivityAt === null
                ? null
                : now - this.lastJobActivityAt;
        this.lastJobActivityAt = now;
        Logger.debug(
            `[scheduler-health] job-event poolId=${this.poolId} previousAgeMs=${ageMs}`,
        );
    }

    markJobStarted() {
        this.inFlightJobCount += 1;
        this.markJobActivity();
    }

    markJobCompleted() {
        // Clamp at 0: missed/duplicate complete events shouldn't drive the counter negative
        // and break the in-flight short-circuit on the next check.
        this.inFlightJobCount = Math.max(0, this.inFlightJobCount - 1);
        this.markJobActivity();
    }

    getInFlightJobCount(): number {
        return this.inFlightJobCount;
    }

    isHealthy(now: number = Date.now()): HealthCheckResult {
        const result = this.computeHealth(now);
        this.logTransitionIfChanged(result, now);
        return result;
    }

    private computeHealth(now: number): HealthCheckResult {
        if (
            this.listenLostAt !== null &&
            now - this.listenLostAt > LISTEN_RECOVERY_BUDGET_MS
        ) {
            return {
                ok: false,
                reason: `LISTEN connection lost for ${Math.round(
                    (now - this.listenLostAt) / 1000,
                )}s`,
            };
        }

        // Startup grace — the per-pool heartbeat takes ~1 min to fire on a fresh worker.
        const sinceStart = now - this.startedAt;
        if (sinceStart < JOB_ACTIVITY_STALENESS_MS) {
            return { ok: true };
        }

        // In-flight jobs prove the pool is still processing; long jobs that fill all
        // concurrency slots must not trip the probe just because no new job:start has
        // fired within the staleness window.
        if (this.inFlightJobCount > 0) {
            return { ok: true };
        }

        if (
            this.lastJobActivityAt === null ||
            now - this.lastJobActivityAt > JOB_ACTIVITY_STALENESS_MS
        ) {
            return {
                ok: false,
                reason: 'no job activity within staleness threshold',
            };
        }

        return { ok: true };
    }

    private static classifyState(
        result: HealthCheckResult,
        ageSinceStartMs: number,
        lastJobActivityAt: number | null,
    ): HealthState {
        if (!result.ok) return 'unhealthy';
        if (
            ageSinceStartMs < JOB_ACTIVITY_STALENESS_MS &&
            lastJobActivityAt === null
        ) {
            return 'starting';
        }
        return 'healthy';
    }

    private logTransitionIfChanged(result: HealthCheckResult, now: number) {
        const newState: HealthState = SchedulerWorkerHealth.classifyState(
            result,
            now - this.startedAt,
            this.lastJobActivityAt,
        );
        if (newState !== this.lastReportedState) {
            Logger.info(
                `[scheduler-health] state poolId=${this.poolId} from=${this.lastReportedState} to=${newState}${
                    result.reason ? ` reason="${result.reason}"` : ''
                }`,
            );
            this.lastReportedState = newState;
        }
    }
}
