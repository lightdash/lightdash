import type { MigrationLeaseStatusProbe } from './MigrationLeaseProbe';
import { SchedulerMigrationQuiesce } from './SchedulerMigrationQuiesce';

const makeHooks = () => ({
    onQuiesceStateChange: vi.fn(),
    onFailure: vi.fn(),
    stopWorkersForRetry: vi.fn(async () => {}),
    startResumeWorkers: vi.fn(async () => {}),
    finishResumeRamp: vi.fn(async () => {}),
});

const makeProbe = (read: () => boolean): MigrationLeaseStatusProbe => ({
    isActive: vi.fn(async () => read()),
});

describe('SchedulerMigrationQuiesce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not grant a dequeue permit while the lease is active', async () => {
        const hooks = makeHooks();
        const controller = new SchedulerMigrationQuiesce({
            probe: makeProbe(() => true),
            pollIntervalMs: 10_000,
            gracePeriodMs: 1_000,
            resumeJitterMs: 100,
            resumeRampPeriodMs: 200,
            hooks,
        });
        await controller.start();

        let settled = false;
        const permit = controller
            .waitForDequeuePermit()
            .then(() => {
                settled = true;
            })
            .catch(() => {
                settled = true;
            });
        await vi.advanceTimersByTimeAsync(999);

        expect(settled).toBe(false);
        expect(hooks.onQuiesceStateChange).toHaveBeenCalledWith(true);

        await controller.stop();
        await permit;
    });

    it('parks in-flight jobs through Graphile after the grace period', async () => {
        const hooks = makeHooks();
        const controller = new SchedulerMigrationQuiesce({
            probe: makeProbe(() => true),
            pollIntervalMs: 10_000,
            gracePeriodMs: 1_000,
            resumeJitterMs: 100,
            resumeRampPeriodMs: 200,
            hooks,
        });
        await controller.start();

        await vi.advanceTimersByTimeAsync(1_000);

        expect(hooks.stopWorkersForRetry).toHaveBeenCalledWith(
            'Migration lease grace period expired',
        );
        await controller.stop();
    });

    it('resumes with jitter at reduced concurrency before finishing the ramp', async () => {
        let active = true;
        const hooks = makeHooks();
        const controller = new SchedulerMigrationQuiesce({
            probe: makeProbe(() => active),
            pollIntervalMs: 10_000,
            gracePeriodMs: 1_000,
            resumeJitterMs: 100,
            resumeRampPeriodMs: 200,
            hooks,
            random: () => 0.5,
        });
        await controller.start();

        active = false;
        await controller.refreshNow(true);
        await vi.advanceTimersByTimeAsync(49);
        expect(hooks.startResumeWorkers).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(hooks.startResumeWorkers).toHaveBeenCalledOnce();
        expect(hooks.finishResumeRamp).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(200);
        expect(hooks.finishResumeRamp).toHaveBeenCalledOnce();
        expect(hooks.onQuiesceStateChange).toHaveBeenLastCalledWith(false);
        await controller.stop();
    });
});
