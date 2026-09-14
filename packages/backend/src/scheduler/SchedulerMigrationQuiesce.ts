import { getErrorMessage } from '@lightdash/common';
import Logger from '../logging/logger';
import type { MigrationLeaseStatusProbe } from './MigrationLeaseProbe';

const DEQUEUE_WAIT_CANCELLED_MESSAGE =
    'Migration lease dequeue wait was cancelled';

type SchedulerMigrationQuiesceHooks = {
    onQuiesceStateChange: (quiesced: boolean) => void;
    onFailure: (error: unknown) => void;
    stopWorkersForRetry: (reason: string) => Promise<void>;
    startResumeWorkers: () => Promise<void>;
    finishResumeRamp: () => Promise<void>;
};

type SchedulerMigrationQuiesceArguments = {
    probe: MigrationLeaseStatusProbe;
    pollIntervalMs: number;
    gracePeriodMs: number;
    resumeJitterMs: number;
    resumeRampPeriodMs: number;
    hooks: SchedulerMigrationQuiesceHooks;
    random?: () => number;
};

type DequeueWaiter = {
    reject: (error: Error) => void;
};

const delay = async (durationMs: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, durationMs);
        timeout.unref();
    });
};

export class SchedulerMigrationQuiesce {
    private readonly probe: MigrationLeaseStatusProbe;

    private readonly pollIntervalMs: number;

    private readonly gracePeriodMs: number;

    private readonly resumeJitterMs: number;

    private readonly resumeRampPeriodMs: number;

    private readonly hooks: SchedulerMigrationQuiesceHooks;

    private readonly random: () => number;

    private readonly dequeueWaiters = new Set<DequeueWaiter>();

    private pollTimeout: NodeJS.Timeout | null = null;

    private graceTimeout: NodeJS.Timeout | null = null;

    private refreshPromise: Promise<boolean> | null = null;

    private leaseActive: boolean | null = null;

    private generation = 0;

    private stopped = false;

    constructor({
        probe,
        pollIntervalMs,
        gracePeriodMs,
        resumeJitterMs,
        resumeRampPeriodMs,
        hooks,
        random = Math.random,
    }: SchedulerMigrationQuiesceArguments) {
        this.probe = probe;
        this.pollIntervalMs = pollIntervalMs;
        this.gracePeriodMs = gracePeriodMs;
        this.resumeJitterMs = resumeJitterMs;
        this.resumeRampPeriodMs = resumeRampPeriodMs;
        this.hooks = hooks;
        this.random = random;
    }

    async start(): Promise<boolean> {
        const active = await this.refreshNow(true);
        this.schedulePoll();
        return active;
    }

    async waitForDequeuePermit(): Promise<null> {
        const active = await this.refreshNow();
        if (!active) {
            return null;
        }

        return new Promise<null>((_resolve, reject) => {
            this.dequeueWaiters.add({ reject });
        });
    }

    async refreshNow(refresh = false): Promise<boolean> {
        if (this.stopped) {
            return true;
        }

        if (this.refreshPromise !== null) {
            return this.refreshPromise;
        }

        this.refreshPromise = this.probe
            .isActive({ refresh })
            .then((active) => {
                this.applyLeaseState(active);
                return active;
            })
            .catch((error: unknown) => {
                Logger.warn(
                    `Migration lease probe failed: ${getErrorMessage(error)}`,
                );
                this.applyLeaseState(true);
                return true;
            });

        try {
            return await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    async stop(): Promise<void> {
        if (this.stopped) {
            return;
        }

        this.stopped = true;
        this.generation += 1;
        this.clearPoll();
        this.clearGrace();
        this.cancelDequeueWaiters();
        await this.hooks.stopWorkersForRetry('Scheduler worker stopping');
    }

    private applyLeaseState(active: boolean): void {
        if (this.leaseActive === null) {
            this.leaseActive = active;
            this.generation += 1;
            if (active) {
                this.hooks.onQuiesceStateChange(true);
                this.scheduleGrace(this.generation);
            } else {
                this.hooks.onQuiesceStateChange(false);
            }
            return;
        }

        if (this.leaseActive === active) {
            return;
        }

        this.leaseActive = active;
        this.generation += 1;
        const { generation } = this;

        if (active) {
            this.hooks.onQuiesceStateChange(true);
            this.scheduleGrace(generation);
            return;
        }

        this.clearGrace();
        this.cancelDequeueWaiters();
        void this.resume(generation).catch((error: unknown) =>
            this.hooks.onFailure(error),
        );
    }

    private scheduleGrace(generation: number): void {
        this.clearGrace();
        this.graceTimeout = setTimeout(() => {
            this.graceTimeout = null;
            if (
                this.stopped ||
                this.leaseActive !== true ||
                generation !== this.generation
            ) {
                return;
            }
            this.cancelDequeueWaiters();
            void this.hooks
                .stopWorkersForRetry('Migration lease grace period expired')
                .catch((error: unknown) => this.hooks.onFailure(error));
        }, this.gracePeriodMs);
        this.graceTimeout.unref();
    }

    private async resume(generation: number): Promise<void> {
        await this.hooks.stopWorkersForRetry(
            'Migration lease cleared before worker resume',
        );
        if (!this.canResume(generation)) {
            return;
        }

        const jitterMs = Math.floor(this.random() * this.resumeJitterMs);
        await delay(jitterMs);
        if (!this.canResume(generation)) {
            return;
        }

        const leaseActive = await this.refreshNow(true);
        if (leaseActive || !this.canResume(generation)) {
            return;
        }

        await this.hooks.startResumeWorkers();
        if (!this.canResume(generation)) {
            return;
        }
        this.hooks.onQuiesceStateChange(false);

        await delay(this.resumeRampPeriodMs);
        if (!this.canResume(generation)) {
            return;
        }

        const leaseReactivated = await this.refreshNow(true);
        if (leaseReactivated || !this.canResume(generation)) {
            return;
        }

        await this.hooks.finishResumeRamp();
    }

    private canResume(generation: number): boolean {
        return (
            !this.stopped &&
            this.leaseActive === false &&
            generation === this.generation
        );
    }

    private cancelDequeueWaiters(): void {
        const error = new Error(DEQUEUE_WAIT_CANCELLED_MESSAGE);
        for (const waiter of this.dequeueWaiters) {
            waiter.reject(error);
        }
        this.dequeueWaiters.clear();
    }

    private schedulePoll(): void {
        this.clearPoll();
        this.pollTimeout = setTimeout(() => {
            this.pollTimeout = null;
            void this.refreshNow(true).finally(() => {
                if (!this.stopped) {
                    this.schedulePoll();
                }
            });
        }, this.pollIntervalMs);
        this.pollTimeout.unref();
    }

    private clearPoll(): void {
        if (this.pollTimeout !== null) {
            clearTimeout(this.pollTimeout);
            this.pollTimeout = null;
        }
    }

    private clearGrace(): void {
        if (this.graceTimeout !== null) {
            clearTimeout(this.graceTimeout);
            this.graceTimeout = null;
        }
    }
}
