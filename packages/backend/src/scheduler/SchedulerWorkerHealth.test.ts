import {
    derivePoolIdFromEnv,
    SchedulerWorkerHealth,
} from './SchedulerWorkerHealth';

const GRACE_MS = 3 * 60_000;
const LISTEN_BUDGET_MS = 60_000;

describe('SchedulerWorkerHealth', () => {
    let realDateNow: () => number;

    beforeEach(() => {
        realDateNow = Date.now;
        Date.now = () => 1_700_000_000_000;
    });

    afterEach(() => {
        Date.now = realDateNow;
    });

    it('exposes the poolId passed to the constructor', () => {
        const health = new SchedulerWorkerHealth('my-pool');
        expect(health.getPoolId()).toBe('my-pool');
    });

    it('generates a poolId when none is provided', () => {
        const a = new SchedulerWorkerHealth();
        const b = new SchedulerWorkerHealth();
        expect(a.getPoolId()).toMatch(/^[a-z0-9]+$/);
        expect(a.getPoolId()).not.toBe(b.getPoolId());
    });

    it('reports healthy inside startup grace with no activity', () => {
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();

        expect(health.isHealthy(startedAt + 30_000)).toEqual({ ok: true });
        expect(health.isHealthy(startedAt + GRACE_MS - 1)).toEqual({
            ok: true,
        });
    });

    it('stays healthy when LISTEN is lost for less than the budget', () => {
        const health = new SchedulerWorkerHealth();
        const t = Date.now();
        health.markListenLost();

        expect(health.isHealthy(t + 30_000)).toEqual({ ok: true });
        expect(health.isHealthy(t + LISTEN_BUDGET_MS)).toEqual({ ok: true });
    });

    it('reports unhealthy with seconds-since-loss when LISTEN exceeds budget', () => {
        const health = new SchedulerWorkerHealth();
        const t = Date.now();
        health.markListenLost();

        const result61s = health.isHealthy(t + 61_000);
        expect(result61s.ok).toBe(false);
        expect(result61s.reason).toBe('LISTEN connection lost for 61s');

        const result125s = health.isHealthy(t + 125_000);
        expect(result125s.ok).toBe(false);
        expect(result125s.reason).toBe('LISTEN connection lost for 125s');
    });

    it('clears listenLostAt when LISTEN recovers', () => {
        const health = new SchedulerWorkerHealth();
        const t = Date.now();
        health.markListenLost();
        // Activity is needed because the grace window will have elapsed by t+120s
        health.markJobActivity();
        health.markListenUp();

        expect(health.isHealthy(t + 120_000)).toEqual({ ok: true });
    });

    it('does not reset listenLostAt clock on repeated lost events', () => {
        const health = new SchedulerWorkerHealth();
        const t = Date.now();
        health.markListenLost();

        // Two more "lost" events arriving 10s and 30s after the first must not
        // reset the failure clock — otherwise a flapping LISTEN could keep the
        // probe green indefinitely.
        Date.now = () => t + 10_000;
        health.markListenLost();
        Date.now = () => t + 30_000;
        health.markListenLost();

        const result = health.isHealthy(t + 65_000);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/LISTEN connection lost for 65s/);
    });

    it('is unhealthy past the grace window when no activity was ever recorded', () => {
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();

        const result = health.isHealthy(startedAt + GRACE_MS + 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(
            'no recent job activity and LISTEN not established',
        );
    });

    it('stays healthy past grace when activity is fresh', () => {
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();

        const activityAt = startedAt + GRACE_MS + 5_000;
        Date.now = () => activityAt;
        health.markJobActivity();

        expect(health.isHealthy(activityAt + 2 * 60_000)).toEqual({ ok: true });
    });

    it('is unhealthy past grace when activity is stale', () => {
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();

        const activityAt = startedAt + GRACE_MS + 5_000;
        Date.now = () => activityAt;
        health.markJobActivity();

        const result = health.isHealthy(activityAt + GRACE_MS + 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe(
            'no recent job activity and LISTEN not established',
        );
    });

    it('reports LISTEN failure even when activity is also stale', () => {
        const health = new SchedulerWorkerHealth();
        const t = Date.now();
        health.markListenLost();

        const result = health.isHealthy(t + 5 * 60_000);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/^LISTEN connection lost/);
    });

    describe('in-flight job count', () => {
        it('starts at zero', () => {
            const health = new SchedulerWorkerHealth();
            expect(health.getInFlightJobCount()).toBe(0);
        });

        it('increments on markJobStarted and decrements on markJobCompleted', () => {
            const health = new SchedulerWorkerHealth();
            health.markJobStarted();
            health.markJobStarted();
            expect(health.getInFlightJobCount()).toBe(2);
            health.markJobCompleted();
            expect(health.getInFlightJobCount()).toBe(1);
            health.markJobCompleted();
            expect(health.getInFlightJobCount()).toBe(0);
        });

        it('clamps at zero so missed events cannot drive the counter negative', () => {
            const health = new SchedulerWorkerHealth();
            health.markJobCompleted();
            health.markJobCompleted();
            expect(health.getInFlightJobCount()).toBe(0);
        });

        it('stays healthy past staleness when jobs are still in flight', () => {
            // Regression: with concurrency saturated by long-running jobs, no new
            // job:start fires within the staleness window. Probe must not trip.
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            health.markJobStarted();

            // No further activity for 10 minutes — well past staleness threshold.
            const result = health.isHealthy(t + 10 * 60_000);
            expect(result).toEqual({ ok: true });
        });

        it('falls back to staleness check after all jobs complete', () => {
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            health.markJobStarted();
            Date.now = () => t + 30_000;
            health.markJobCompleted();

            // Past grace + past staleness with no in-flight jobs and last activity
            // older than the staleness window.
            const result = health.isHealthy(t + 30_000 + GRACE_MS + 1);
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/job activity/i);
        });

        it('reports LISTEN failure even with jobs in flight', () => {
            // LISTEN failure is the May-incident-class signal — in-flight jobs
            // running mid-wedge must not suppress it.
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            health.markJobStarted();
            health.markListenLost();

            const result = health.isHealthy(t + LISTEN_BUDGET_MS + 1);
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/^LISTEN connection lost/);
        });
    });

    describe('pg-reachable signal (negative only)', () => {
        it('does NOT let a fresh pg-ping vouch for an idle worker with no LISTEN', () => {
            // The Aug 2026 incident class: pool dead after a transient
            // Postgres restart, no jobs flowing, but plain pg queries succeed
            // because the DB is back. The old pgReachableFresh branch returned
            // 200 for days in this state. A fresh ping must never vouch.
            const health = new SchedulerWorkerHealth();
            const startedAt = Date.now();

            const pingAt = startedAt + GRACE_MS + 4 * 60_000;
            Date.now = () => pingAt;
            health.markPgReachable();

            const result = health.isHealthy(pingAt + 60_000);
            expect(result.ok).toBe(false);
            expect(result.reason).toBe(
                'no recent job activity and LISTEN not established',
            );
        });

        it('trips with a postgres-unreachable reason when the ping goes stale on an idle worker', () => {
            const health = new SchedulerWorkerHealth();
            const startedAt = Date.now();

            const activityAt = startedAt + GRACE_MS + 1_000;
            Date.now = () => activityAt;
            health.markJobActivity();
            health.markPgReachable();
            health.markListenUp();

            // Activity and ping both 3min+1ms old; LISTEN is up, but the
            // stale ping (DB unreachable) must win over the idle-ok path.
            const result = health.isHealthy(activityAt + GRACE_MS + 1);
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/^postgres unreachable for \d+s$/);
        });

        it('does not trip on a stale ping while jobs are actively flowing', () => {
            // Live job traffic is stronger evidence than a ping — transient
            // ping timeouts must not restart a worker that is executing jobs.
            const health = new SchedulerWorkerHealth();
            const startedAt = Date.now();

            Date.now = () => startedAt;
            health.markPgReachable();

            const laterActivity = startedAt + GRACE_MS + 5 * 60_000;
            Date.now = () => laterActivity;
            health.markJobActivity();

            expect(health.isHealthy(laterActivity + 60_000)).toEqual({
                ok: true,
            });
        });

        it('reports LISTEN failure even when pg ping is still fresh', () => {
            // LISTEN and pg-ping cover different failure modes — a wedged
            // LISTEN connection with healthy plain pg queries is the May
            // wire-protocol corruption pattern, and the probe must trip.
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            health.markPgReachable();
            health.markListenLost();

            const result = health.isHealthy(t + LISTEN_BUDGET_MS + 1);
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/^LISTEN connection lost/);
        });

        it('treats a successful ping during startup as evidence the worker has progressed past "starting"', () => {
            // classifyState should consider the worker healthy (not starting)
            // once any liveness signal has fired, even before the first job.
            const health = new SchedulerWorkerHealth();
            health.markPgReachable();
            expect(health.isHealthy()).toEqual({ ok: true });
        });
    });

    describe('idle worker with LISTEN established', () => {
        it('stays healthy indefinitely while LISTEN is up and pg is reachable', () => {
            // Replaces the old pgReachableFresh voucher for legitimately idle
            // instances: connected LISTEN means the worker is wired for
            // wake-up. A dead pool cannot sustain this state — the heartbeat
            // NOTIFY makes its own listener nudge the pool, which trips the
            // poolDead latch.
            const health = new SchedulerWorkerHealth();
            const startedAt = Date.now();
            health.markListenUp();

            const muchLater = startedAt + 6 * 60 * 60_000;
            Date.now = () => muchLater;
            health.markPgReachable();

            expect(health.isHealthy(muchLater + 30_000)).toEqual({ ok: true });
        });

        it('tolerates a transient listen blip inside the 60s budget on an idle worker', () => {
            // The 60s LISTEN budget is the sole arbiter for reconnects — an
            // idle worker must not flip 503 on the first blip (that would be
            // stricter than the old pgReachableFresh behavior and cause
            // liveness churn on ordinary reconnects). Past the budget the
            // LISTEN branch trips as before; a dead pool is caught by the
            // poolDead latch, not this path.
            const health = new SchedulerWorkerHealth();
            const startedAt = Date.now();
            health.markListenUp();

            const lostAt = startedAt + GRACE_MS + 10 * 60_000;
            Date.now = () => lostAt;
            health.markPgReachable();
            health.markListenLost();

            expect(health.isHealthy(lostAt + 30_000)).toEqual({ ok: true });

            const pastBudget = health.isHealthy(lostAt + LISTEN_BUDGET_MS + 1);
            expect(pastBudget.ok).toBe(false);
            expect(pastBudget.reason).toMatch(/^LISTEN connection lost/);
        });
    });

    describe('pool-dead latch', () => {
        it('reports unhealthy with the terminating reason, overriding every other signal', () => {
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            // Everything else looks healthy: fresh ping, LISTEN up, job in
            // flight, fresh activity — the dead pool must still win.
            health.markPgReachable();
            health.markListenUp();
            health.markJobStarted();
            health.markPoolDead('nudge called after worker terminated');

            const result = health.isHealthy(t + 1);
            expect(result.ok).toBe(false);
            expect(result.reason).toBe(
                'worker pool terminated: nudge called after worker terminated',
            );
        });

        it('is permanent — later recovery signals cannot clear it', () => {
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            health.markPoolDead('boom');

            health.markListenUp();
            health.markJobStarted();
            health.markJobActivity();
            health.markPgReachable();

            expect(health.isHealthy(t + 10_000).ok).toBe(false);
            expect(health.isHealthy(t + 60 * 60_000).ok).toBe(false);
        });

        it('latches on first call only and reports whether this call latched', () => {
            const health = new SchedulerWorkerHealth();
            expect(health.markPoolDead('first')).toBe(true);
            expect(health.markPoolDead('second')).toBe(false);

            // The retained reason is the first one.
            const result = health.isHealthy(Date.now() + 1);
            expect(result.reason).toBe('worker pool terminated: first');
        });

        it('fires onPoolDead listeners exactly once despite repeated triggers', () => {
            // The LISTEN retry loop re-raises the nudge error every ~100ms;
            // the exit side effect must not be scheduled repeatedly.
            const health = new SchedulerWorkerHealth();
            const listener = vi.fn();
            health.onPoolDead(listener);

            health.markPoolDead('nudge called after worker terminated');
            health.markPoolDead('nudge called after worker terminated');
            health.markPoolDead('nudge called after worker terminated');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(
                'nudge called after worker terminated',
            );
        });

        it('a throwing listener does not prevent the latch or other listeners', () => {
            const health = new SchedulerWorkerHealth();
            const second = vi.fn();
            health.onPoolDead(() => {
                throw new Error('listener bug');
            });
            health.onPoolDead(second);

            expect(health.markPoolDead('boom')).toBe(true);
            expect(second).toHaveBeenCalledTimes(1);
            expect(health.isHealthy(Date.now() + 1).ok).toBe(false);
        });
    });
});

describe('derivePoolIdFromEnv — multi-replica uniqueness', () => {
    it('prefers K8S_POD_NAME when present', () => {
        const env: NodeJS.ProcessEnv = {
            K8S_POD_NAME: 'scheduler-7df9c-abc12',
            POD_NAME: 'fallback-name',
            HOSTNAME: 'scheduler-7df9c-abc12',
        };
        expect(derivePoolIdFromEnv(env)).toBe('scheduler-7df9c-abc12');
    });

    it('falls back to POD_NAME when K8S_POD_NAME is unset', () => {
        const env: NodeJS.ProcessEnv = {
            POD_NAME: 'scheduler-7df9c-xyz98',
            HOSTNAME: 'scheduler-7df9c-xyz98',
        };
        expect(derivePoolIdFromEnv(env)).toBe('scheduler-7df9c-xyz98');
    });

    it('falls back to HOSTNAME when no explicit downward-API binding exists', () => {
        const env: NodeJS.ProcessEnv = {
            HOSTNAME: 'scheduler-7df9c-mno55',
        };
        expect(derivePoolIdFromEnv(env)).toBe('scheduler-7df9c-mno55');
    });

    it('returns undefined when no pod-identity env vars are set', () => {
        const env: NodeJS.ProcessEnv = {};
        expect(derivePoolIdFromEnv(env)).toBeUndefined();
    });

    it('treats empty-string env vars as missing (avoids "" as a poolId)', () => {
        const env: NodeJS.ProcessEnv = {
            K8S_POD_NAME: '',
            POD_NAME: '',
            HOSTNAME: 'real-hostname-fallback',
        };
        expect(derivePoolIdFromEnv(env)).toBe('real-hostname-fallback');
    });

    it('produces distinct poolIds for two replicas with different pod names', () => {
        // This is THE regression being guarded — pre-fix, both replicas
        // received the same hardcoded 'scheduler-app' poolId, collapsing
        // their log streams under a single identifier.
        const replicaA = derivePoolIdFromEnv({
            HOSTNAME: 'scheduler-deployment-7df9c-aaa11',
        });
        const replicaB = derivePoolIdFromEnv({
            HOSTNAME: 'scheduler-deployment-7df9c-bbb22',
        });

        expect(replicaA).toBe('scheduler-deployment-7df9c-aaa11');
        expect(replicaB).toBe('scheduler-deployment-7df9c-bbb22');
        expect(replicaA).not.toBe(replicaB);
    });

    it('uses the random fallback when env yields nothing — distinct replicas still differ', () => {
        // SchedulerApp passes `derivePoolIdFromEnv()` straight into the
        // constructor. When the helper returns undefined (e.g. local dev,
        // test environments), the constructor's random fallback kicks in
        // and uniqueness is still preserved per process.
        const a = new SchedulerWorkerHealth(derivePoolIdFromEnv({}));
        const b = new SchedulerWorkerHealth(derivePoolIdFromEnv({}));
        expect(a.getPoolId()).toMatch(/^[a-z0-9]+$/);
        expect(b.getPoolId()).toMatch(/^[a-z0-9]+$/);
        expect(a.getPoolId()).not.toBe(b.getPoolId());
    });
});
