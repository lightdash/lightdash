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
            'no job activity within staleness threshold',
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
            'no job activity within staleness threshold',
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
        // received the same hardcoded 'scheduler-app' poolId.
        const replicaA = derivePoolIdFromEnv({
            HOSTNAME: 'scheduler-deployment-7df9c-aaa11',
        });
        const replicaB = derivePoolIdFromEnv({
            HOSTNAME: 'scheduler-deployment-7df9c-bbb22',
        });

        expect(replicaA).toBe('scheduler-deployment-7df9c-aaa11');
        expect(replicaB).toBe('scheduler-deployment-7df9c-bbb22');
        expect(replicaA).not.toBe(replicaB);

        // And the downstream task names that drive the per-pool routing
        // must also differ — this is what graphile-worker uses to decide
        // which runner can fetch a given workerHeartbeat:* job.
        const taskA = `workerHeartbeat:${replicaA}`;
        const taskB = `workerHeartbeat:${replicaB}`;
        expect(taskA).not.toBe(taskB);
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
