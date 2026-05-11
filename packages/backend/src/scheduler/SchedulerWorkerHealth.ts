const LISTEN_RECOVERY_BUDGET_MS = 60_000;

const JOB_ACTIVITY_STALENESS_MS = 3 * 60_000;

export class SchedulerWorkerHealth {
    private lastListenSuccessAt: number | null = null;

    private listenLostAt: number | null = null;

    private lastJobActivityAt: number | null = null;

    private startedAt: number = Date.now();

    markListenUp() {
        this.lastListenSuccessAt = Date.now();
        this.listenLostAt = null;
    }

    markListenLost() {
        if (this.listenLostAt === null) {
            this.listenLostAt = Date.now();
        }
    }

    markJobActivity() {
        this.lastJobActivityAt = Date.now();
    }

    isHealthy(now: number = Date.now()): { ok: boolean; reason?: string } {
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

        // Grace period after startup before requiring job activity: the
        // heartbeat cron needs ~1 minute to fire on a fresh worker.
        const sinceStart = now - this.startedAt;
        if (sinceStart < JOB_ACTIVITY_STALENESS_MS) {
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
}

export const schedulerWorkerHealth = new SchedulerWorkerHealth();
