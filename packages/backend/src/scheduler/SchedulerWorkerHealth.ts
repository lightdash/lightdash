import Logger from '../logging/logger';

const LISTEN_RECOVERY_BUDGET_MS = 60_000;

const JOB_ACTIVITY_STALENESS_MS = 3 * 60_000;

// A successful pg ping within this window proves the worker process can still
// reach the database, even when no graphile-worker job has fired recently.
const PG_REACHABLE_STALENESS_MS = 3 * 60_000;

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

    private lastPgReachableAt: number | null = null;

    private inFlightJobCount: number = 0;

    private startedAt: number = Date.now();

    private lastReportedState: HealthState = 'starting';

    constructor(poolId?: string) {
        this.poolId = poolId ?? Math.random().toString(36).slice(2, 10);
        Logger.info(
            `[scheduler-health] initialized poolId=${this.poolId} startedAt=${new Date(
                this.startedAt,
            ).toISOString()} listenBudgetMs=${LISTEN_RECOVERY_BUDGET_MS} activityStalenessMs=${JOB_ACTIVITY_STALENESS_MS} pgReachableStalenessMs=${PG_REACHABLE_STALENESS_MS}`,
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

    markPgReachable() {
        const now = Date.now();
        const ageMs =
            this.lastPgReachableAt === null
                ? null
                : now - this.lastPgReachableAt;
        this.lastPgReachableAt = now;
        Logger.debug(
            `[scheduler-health] pg-reachable poolId=${this.poolId} previousAgeMs=${ageMs}`,
        );
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

        const jobActivityFresh =
            this.lastJobActivityAt !== null &&
            now - this.lastJobActivityAt <= JOB_ACTIVITY_STALENESS_MS;
        if (jobActivityFresh) {
            return { ok: true };
        }

        // pg ping runs independently of the job queue, so it stays fresh during
        // idle stretches between bursts when no job:start fires.
        const pgReachableFresh =
            this.lastPgReachableAt !== null &&
            now - this.lastPgReachableAt <= PG_REACHABLE_STALENESS_MS;
        if (pgReachableFresh) {
            return { ok: true };
        }

        return {
            ok: false,
            reason: 'no job activity or pg ping within staleness threshold',
        };
    }

    private static classifyState(
        result: HealthCheckResult,
        ageSinceStartMs: number,
        lastJobActivityAt: number | null,
        lastPgReachableAt: number | null,
    ): HealthState {
        if (!result.ok) return 'unhealthy';
        if (
            ageSinceStartMs < JOB_ACTIVITY_STALENESS_MS &&
            lastJobActivityAt === null &&
            lastPgReachableAt === null
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
            this.lastPgReachableAt,
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
