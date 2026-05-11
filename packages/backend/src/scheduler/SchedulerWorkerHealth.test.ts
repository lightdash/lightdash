import Logger from '../logging/logger';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';

const GRACE_MS = 3 * 60_000;
const LISTEN_BUDGET_MS = 60_000;

describe('SchedulerWorkerHealth', () => {
    let realDateNow: () => number;

    beforeEach(() => {
        realDateNow = Date.now;
        Date.now = () => 1_700_000_000_000;
        jest.spyOn(Logger, 'info').mockImplementation(() => Logger);
        jest.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        jest.spyOn(Logger, 'debug').mockImplementation(() => Logger);
    });

    afterEach(() => {
        Date.now = realDateNow;
        jest.restoreAllMocks();
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

    it('logs a state transition on first unhealthy result', () => {
        const health = new SchedulerWorkerHealth('logger-test');
        const startedAt = Date.now();
        const result = health.isHealthy(startedAt + GRACE_MS + 1);
        expect(result.ok).toBe(false);
        expect(Logger.info).toHaveBeenCalledWith(
            expect.stringContaining(
                '[scheduler-health] state poolId=logger-test',
            ),
        );
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
});
