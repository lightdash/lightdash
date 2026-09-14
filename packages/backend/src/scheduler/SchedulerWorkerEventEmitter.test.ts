import EventEmitter from 'events';
import type { WorkerEvents } from 'graphile-worker';
import {
    POOL_TERMINATED_ERROR_SIGNATURE,
    wireWorkerHealthEvents,
} from './SchedulerWorkerEventEmitter';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';

const GRACE_MS = 3 * 60_000;
const LISTEN_BUDGET_MS = 60_000;

describe('wireWorkerHealthEvents', () => {
    let realDateNow: () => number;

    beforeEach(() => {
        realDateNow = Date.now;
        Date.now = () => 1_700_000_000_000;
    });

    afterEach(() => {
        Date.now = realDateNow;
    });

    it('keeps the probe healthy when LISTEN is up', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('pool:listen:success', {});

        // Inside grace window — should be healthy regardless of activity.
        expect(health.isHealthy(startedAt + 30_000).ok).toBe(true);
    });

    it('reports unhealthy when pool:listen:error stays unrecovered past the 60s budget', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const lostAt = Date.now();
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('pool:listen:error', {});

        const result = health.isHealthy(lostAt + LISTEN_BUDGET_MS + 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/LISTEN/);
    });

    it('recovers to healthy when pool:listen:success follows a pool:listen:error', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('pool:listen:error', {});
        (emitter as unknown as EventEmitter).emit('pool:listen:success', {});

        // Past the listen budget, but recovery cleared listenLostAt — still
        // healthy because we're inside the activity grace window.
        expect(health.isHealthy(startedAt + 2 * LISTEN_BUDGET_MS).ok).toBe(
            true,
        );
    });

    it('keeps the probe healthy past the grace window when job events fire', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();
        wireWorkerHealthEvents(emitter, health);

        // Advance past grace window and emit job activity.
        const activityAt = startedAt + GRACE_MS + 5_000;
        Date.now = () => activityAt;
        (emitter as unknown as EventEmitter).emit('job:start', {});

        // Still inside the 3-min activity staleness window after the event.
        expect(health.isHealthy(activityAt + 60_000).ok).toBe(true);
    });

    it('falls to unhealthy past the grace window when no job events fire', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();
        wireWorkerHealthEvents(emitter, health);

        // No job events emitted; check past the grace window.
        const result = health.isHealthy(startedAt + GRACE_MS + 1);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/job activity/i);
    });

    it('tracks in-flight jobs from job:start and job:complete', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('job:start', {});
        (emitter as unknown as EventEmitter).emit('job:start', {});
        expect(health.getInFlightJobCount()).toBe(2);

        (emitter as unknown as EventEmitter).emit('job:complete', {});
        expect(health.getInFlightJobCount()).toBe(1);
    });

    it('stays healthy past the staleness window while a long job is in flight', () => {
        // The concurrency-saturation regression: 3 long jobs occupy all slots,
        // no further job:start fires, and the probe must not trip.
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const startedAt = Date.now();
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('job:start', {});

        // Past grace + staleness with the job still running.
        expect(health.isHealthy(startedAt + GRACE_MS + 60_000).ok).toBe(true);
    });

    describe('terminated-pool detection on pool:listen:error', () => {
        it('latches poolDead immediately when the error carries the nudge signature', () => {
            const emitter = new EventEmitter() as unknown as WorkerEvents;
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            wireWorkerHealthEvents(emitter, health);

            (emitter as unknown as EventEmitter).emit('pool:listen:error', {
                error: new Error(POOL_TERMINATED_ERROR_SIGNATURE),
            });

            // Unhealthy right away — no 60s LISTEN budget for a dead pool.
            const result = health.isHealthy(t + 1);
            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/^worker pool terminated:/);
        });

        it('matches the production error shape where the signature is embedded in a longer message', () => {
            // Observed in app_logs: "Unsupported warehouse protocol message:
            // nudge called after worker terminated" — wrapper prefixes must
            // not defeat the match.
            const emitter = new EventEmitter() as unknown as WorkerEvents;
            const health = new SchedulerWorkerHealth();
            wireWorkerHealthEvents(emitter, health);

            (emitter as unknown as EventEmitter).emit('pool:listen:error', {
                error: new Error(
                    `Unsupported warehouse protocol message: ${POOL_TERMINATED_ERROR_SIGNATURE}`,
                ),
            });

            expect(health.isHealthy(Date.now() + 1).ok).toBe(false);
        });

        it('cannot be cleared by the flapping listen success/error cycle', () => {
            // Production pattern: the LISTEN client reconnects fine (success),
            // then the next NOTIFY nudges the dead pool (error), every ~100ms.
            // Pre-latch, the alternation kept resetting the 60s budget and the
            // probe stayed green for 2.5 days.
            const emitter = new EventEmitter() as unknown as WorkerEvents;
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            wireWorkerHealthEvents(emitter, health);

            for (let i = 0; i < 5; i += 1) {
                (emitter as unknown as EventEmitter).emit('pool:listen:error', {
                    error: new Error(POOL_TERMINATED_ERROR_SIGNATURE),
                });
                (emitter as unknown as EventEmitter).emit(
                    'pool:listen:success',
                    {},
                );
            }

            expect(health.isHealthy(t + 1).ok).toBe(false);
        });

        it('fires the poolDead side effect once across repeated nudge errors', () => {
            const emitter = new EventEmitter() as unknown as WorkerEvents;
            const health = new SchedulerWorkerHealth();
            const onPoolDead = vi.fn();
            health.onPoolDead(onPoolDead);
            wireWorkerHealthEvents(emitter, health);

            for (let i = 0; i < 3; i += 1) {
                (emitter as unknown as EventEmitter).emit('pool:listen:error', {
                    error: new Error(POOL_TERMINATED_ERROR_SIGNATURE),
                });
            }

            expect(onPoolDead).toHaveBeenCalledTimes(1);
        });

        it('treats ordinary listen errors as recoverable LISTEN loss, not pool death', () => {
            const emitter = new EventEmitter() as unknown as WorkerEvents;
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            wireWorkerHealthEvents(emitter, health);

            (emitter as unknown as EventEmitter).emit('pool:listen:error', {
                error: new Error('Connection terminated unexpectedly'),
            });

            // Inside the 60s budget: still healthy (recoverable).
            expect(health.isHealthy(t + 30_000).ok).toBe(true);
            // Recovery clears it.
            (emitter as unknown as EventEmitter).emit(
                'pool:listen:success',
                {},
            );
            expect(health.isHealthy(t + 2 * LISTEN_BUDGET_MS).ok).toBe(true);
        });

        it('handles a payload with a non-Error error value', () => {
            const emitter = new EventEmitter() as unknown as WorkerEvents;
            const health = new SchedulerWorkerHealth();
            const t = Date.now();
            wireWorkerHealthEvents(emitter, health);

            (emitter as unknown as EventEmitter).emit('pool:listen:error', {
                error: `string error: ${POOL_TERMINATED_ERROR_SIGNATURE}`,
            });

            expect(health.isHealthy(t + 1).ok).toBe(false);
        });
    });
});
