import Logger from '../logging/logger';

const LISTEN_RECOVERY_BUDGET_MS = 60_000;

const JOB_ACTIVITY_STALENESS_MS = 3 * 60_000;

// A pg ping older than this window means the worker process cannot reach the
// database. Negative signal only: a fresh ping never vouches for health, since
// DB reachability is exactly what still holds when the worker pool is dead.
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

    private poolDeadAt: number | null = null;

    private poolDeadReason: string | null = null;

    private readonly poolDeadListeners: Array<(reason: string) => void> = [];

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

    // Register a callback for the pool-dead latch. Fires at most once, on the
    // first markPoolDead call.
    onPoolDead(listener: (reason: string) => void) {
        this.poolDeadListeners.push(listener);
    }

    // Permanent latch: a terminated graphile-worker pool cannot recover
    // in-process (0.13 never respawns dead workers), so once this fires the
    // probe reports unhealthy until the process is replaced. Returns true only
    // on the first call so callers can gate side effects; the LISTEN retry loop
    // re-raises the same error every ~100ms and must not re-trigger them.
    markPoolDead(reason: string): boolean {
        if (this.poolDeadAt !== null) {
            return false;
        }
        this.poolDeadAt = Date.now();
        this.poolDeadReason = reason;
        Logger.error(
            `[scheduler-health] worker pool dead poolId=${this.poolId} reason="${reason}" — unhealthy until restart`,
        );
        this.poolDeadListeners.forEach((listener) => {
            try {
                listener(reason);
            } catch (e) {
                Logger.error(
                    `[scheduler-health] pool-dead listener threw poolId=${this.poolId}`,
                    e,
                );
            }
        });
        return true;
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
        // Terminated pool wins over every other signal: DB reachability, a
        // reconnected LISTEN client, even in-flight bookkeeping. This is the
        // Aug 2026 incident class — pool dead, everything else looks fine.
        if (this.poolDeadAt !== null) {
            return {
                ok: false,
                reason: `worker pool terminated: ${
                    this.poolDeadReason ?? 'unknown'
                }`,
            };
        }

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

        // Startup grace — the pg ping and LISTEN take a moment to establish on
        // a fresh worker.
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

        // With no job flowing, a stale pg ping means the worker cannot reach
        // postgres at all — jobs could not be fetched even if enqueued.
        // Deliberately checked only on the idle path: live job traffic is
        // stronger evidence than a ping and must not be overridden by it.
        if (
            this.lastPgReachableAt !== null &&
            now - this.lastPgReachableAt > PG_REACHABLE_STALENESS_MS
        ) {
            return {
                ok: false,
                reason: `postgres unreachable for ${Math.round(
                    (now - this.lastPgReachableAt) / 1000,
                )}s`,
            };
        }

        // Idle is healthy only while wired for wake-up: LISTEN established and
        // no unrecovered listen error. A dead pool cannot sustain this state —
        // the minutely heartbeat NOTIFY makes its listener nudge the pool,
        // which trips the poolDead latch above.
        //
        // Note this replaces the old `pgReachableFresh` voucher: a successful
        // ping proves DB reachability, which is precisely the condition that
        // still holds when the pool is dead after a transient Postgres outage.
        // It vouched 200 for workers that had executed nothing for days.
        const listenUp =
            this.lastListenSuccessAt !== null && this.listenLostAt === null;
        if (listenUp) {
            return { ok: true };
        }

        return {
            ok: false,
            reason: 'no recent job activity and LISTEN not established',
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
