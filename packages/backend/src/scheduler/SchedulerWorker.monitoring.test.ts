import { SCHEDULER_TASKS } from '@lightdash/common';
import prometheus from 'prom-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import PrometheusMetrics from '../prometheus/PrometheusMetrics';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

class TestableSchedulerWorker extends SchedulerWorker {
    public generatePreAggregates = vi.fn(async () => {});

    protected async generateDailyPreAggregateMaterializationJobs() {
        await this.generatePreAggregates();
    }

    public generateDailyJobs() {
        return this.getFullTaskList()[SCHEDULER_TASKS.GENERATE_DAILY_JOBS](
            {
                organizationUuid: 'organization',
                projectUuid: 'project',
                userUuid: 'user',
            },
            {} as never,
        );
    }
}

const makeWorker = (withMetrics = true) => {
    const schedulers = [
        { schedulerUuid: 'scheduler-a', createdBy: 'user-a' },
        { schedulerUuid: 'scheduler-b', createdBy: 'user-b' },
    ];
    const schedulerService = {
        getAllSchedulers: vi.fn().mockResolvedValue(schedulers),
        logSchedulerJob: vi.fn().mockResolvedValue(undefined),
        getSchedulerDefaultTimezoneForScheduler: vi
            .fn()
            .mockResolvedValue('UTC'),
        getSchedulerProjectContext: vi.fn().mockResolvedValue({
            organizationUuid: 'organization',
            projectUuid: 'project',
        }),
    };
    const schedulerClient = {
        generateDailyJobsForScheduler: vi.fn().mockResolvedValue(undefined),
    };
    const prometheusMetrics = {
        recordSchedulerDailyJobGenerationCompleted: vi.fn(),
        recordSchedulerDailyJobGenerationError: vi.fn(),
    };
    const worker = new TestableSchedulerWorker({
        lightdashConfig: lightdashConfigMock,
        dailyJobRetryBackoffMs: [0, 0],
        schedulerService,
        schedulerClient,
        ...(withMetrics ? { prometheusMetrics } : {}),
    } as unknown as SchedulerWorkerArguments);
    return { worker, schedulerService, schedulerClient, prometheusMetrics };
};

describe('daily job generation monitoring', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const makeWorkerWithFailingMetrics = () => {
        const fixture = makeWorker();
        const metrics = new PrometheusMetrics(lightdashConfigMock.prometheus);
        metrics.schedulerDailyJobGenerationLastCompletedTimestamp =
            new prometheus.Gauge({
                name: 'test_daily_generation_completion',
                help: 'Test completion metric',
                registers: [],
            });
        metrics.schedulerDailyJobGenerationErrors = new prometheus.Counter({
            name: 'test_daily_generation_errors',
            help: 'Test error metric',
            labelNames: ['phase'],
            registers: [],
        });
        vi.spyOn(
            metrics.schedulerDailyJobGenerationLastCompletedTimestamp,
            'set',
        ).mockImplementation(() => {
            throw new Error('gauge update failed');
        });
        vi.spyOn(
            metrics.schedulerDailyJobGenerationErrors,
            'inc',
        ).mockImplementation(() => {
            throw new Error('counter update failed');
        });
        fixture.prometheusMetrics.recordSchedulerDailyJobGenerationCompleted.mockImplementation(
            () => metrics.recordSchedulerDailyJobGenerationCompleted(),
        );
        fixture.prometheusMetrics.recordSchedulerDailyJobGenerationError.mockImplementation(
            (phase) => metrics.recordSchedulerDailyJobGenerationError(phase),
        );
        return fixture;
    };

    it('completes generation even when the heartbeat metric throws', async () => {
        const { worker, schedulerClient } = makeWorkerWithFailingMetrics();
        await expect(worker.generateDailyJobs()).resolves.toBeUndefined();
        expect(
            schedulerClient.generateDailyJobsForScheduler,
        ).toHaveBeenCalledTimes(2);
        expect(worker.generatePreAggregates).toHaveBeenCalledOnce();
    });

    it('preserves the original scheduler-list error when its metric throws', async () => {
        const { worker, schedulerService } = makeWorkerWithFailingMetrics();
        const error = new Error('database unavailable');
        schedulerService.getAllSchedulers.mockRejectedValue(error);
        await expect(worker.generateDailyJobs()).rejects.toBe(error);
    });

    it.each([false, true])(
        'preserves failure history and task outcome when metrics throw (all failed: %s)',
        async (allFailed) => {
            const { worker, schedulerService, schedulerClient } =
                makeWorkerWithFailingMetrics();
            const error = new Error('insert failed');
            if (allFailed) {
                schedulerClient.generateDailyJobsForScheduler.mockRejectedValue(
                    error,
                );
            } else {
                schedulerClient.generateDailyJobsForScheduler.mockRejectedValueOnce(
                    error,
                );
            }
            const run = worker.generateDailyJobs();
            if (allFailed) {
                await expect(run).rejects.toThrow(
                    'Failed to generate daily jobs for all schedulers',
                );
            } else {
                await expect(run).resolves.toBeUndefined();
            }
            expect(schedulerService.logSchedulerJob).toHaveBeenCalledTimes(
                allFailed ? 2 : 1,
            );
            expect(worker.generatePreAggregates).toHaveBeenCalledOnce();
        },
    );

    it('preserves pre-aggregate failure handling when metrics throw', async () => {
        const { worker, prometheusMetrics } = makeWorkerWithFailingMetrics();
        worker.generatePreAggregates.mockRejectedValue(
            new Error('pre-aggregate lookup failed'),
        );
        await expect(worker.generateDailyJobs()).resolves.toBeUndefined();
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenCalledWith('pre_aggregate');
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).toHaveBeenCalledOnce();
    });

    it('records completion only after all schedulers and pre-aggregates finish', async () => {
        const { worker, schedulerClient, prometheusMetrics } = makeWorker();
        let finishScheduler!: () => void;
        schedulerClient.generateDailyJobsForScheduler.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                finishScheduler = resolve;
            }),
        );
        let finishPreAggregates!: () => void;
        worker.generatePreAggregates.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishPreAggregates = resolve;
                }),
        );

        const run = worker.generateDailyJobs();
        await vi.waitFor(() => {
            expect(
                schedulerClient.generateDailyJobsForScheduler,
            ).toHaveBeenCalledTimes(2);
        });
        expect(worker.generatePreAggregates).not.toHaveBeenCalled();
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).not.toHaveBeenCalled();

        finishScheduler();
        await vi.waitFor(() => {
            expect(worker.generatePreAggregates).toHaveBeenCalledOnce();
        });
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).not.toHaveBeenCalled();

        finishPreAggregates();
        await run;
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).toHaveBeenCalledOnce();
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).not.toHaveBeenCalled();
    });

    it('counts partial failures even when the task resolves', async () => {
        const { worker, schedulerClient, prometheusMetrics } = makeWorker();
        schedulerClient.generateDailyJobsForScheduler.mockRejectedValueOnce(
            new Error('insert failed'),
        );
        await worker.generateDailyJobs();
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenCalledExactlyOnceWith('scheduler');
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).toHaveBeenCalledOnce();
    });

    it('counts every failed scheduler and preserves the all-failed rejection', async () => {
        const { worker, schedulerService, prometheusMetrics } = makeWorker();
        schedulerService.getSchedulerDefaultTimezoneForScheduler.mockRejectedValue(
            new Error('lookup failed'),
        );
        await expect(worker.generateDailyJobs()).rejects.toThrow(
            'Failed to generate daily jobs for all schedulers',
        );
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenCalledTimes(2);
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenNthCalledWith(1, 'scheduler');
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenNthCalledWith(2, 'scheduler');
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).toHaveBeenCalledOnce();
    });

    it.each([false, true])(
        'counts only exhausted transient failures (exhausted: %s)',
        async (exhausted) => {
            const {
                worker,
                schedulerService,
                schedulerClient,
                prometheusMetrics,
            } = makeWorker();
            schedulerService.getAllSchedulers.mockResolvedValue([
                { schedulerUuid: 'scheduler-a', createdBy: 'user-a' },
            ]);
            const error = new Error('Knex: Timeout acquiring a connection');
            error.name = 'KnexTimeoutError';
            schedulerClient.generateDailyJobsForScheduler
                .mockRejectedValueOnce(error)
                .mockRejectedValueOnce(error);
            if (exhausted) {
                schedulerClient.generateDailyJobsForScheduler.mockRejectedValueOnce(
                    error,
                );
                await expect(worker.generateDailyJobs()).rejects.toThrow(
                    'Failed to generate daily jobs for all schedulers',
                );
                expect(
                    prometheusMetrics.recordSchedulerDailyJobGenerationError,
                ).toHaveBeenCalledExactlyOnceWith('scheduler');
            } else {
                await worker.generateDailyJobs();
                expect(
                    prometheusMetrics.recordSchedulerDailyJobGenerationError,
                ).not.toHaveBeenCalled();
            }
            expect(
                schedulerClient.generateDailyJobsForScheduler,
            ).toHaveBeenCalledTimes(3);
            expect(
                prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
            ).toHaveBeenCalledOnce();
        },
    );

    it('counts a scheduler-list failure without reporting completion', async () => {
        const { worker, schedulerService, prometheusMetrics } = makeWorker();
        schedulerService.getAllSchedulers.mockRejectedValue(
            new Error('database unavailable'),
        );
        await expect(worker.generateDailyJobs()).rejects.toThrow(
            'database unavailable',
        );
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenCalledExactlyOnceWith('load_schedulers');
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).not.toHaveBeenCalled();
    });

    it('counts a pre-aggregate batch failure without changing task behavior', async () => {
        const { worker, prometheusMetrics } = makeWorker();
        worker.generatePreAggregates.mockRejectedValue(
            new Error('pre-aggregate lookup failed'),
        );
        await worker.generateDailyJobs();
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationError,
        ).toHaveBeenCalledExactlyOnceWith('pre_aggregate');
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).toHaveBeenCalledOnce();
    });

    it('records completion for an instance with no scheduled deliveries', async () => {
        const { worker, schedulerService, prometheusMetrics } = makeWorker();
        schedulerService.getAllSchedulers.mockResolvedValue([]);
        await worker.generateDailyJobs();
        expect(worker.generatePreAggregates).toHaveBeenCalledOnce();
        expect(
            prometheusMetrics.recordSchedulerDailyJobGenerationCompleted,
        ).toHaveBeenCalledOnce();
    });

    it('still runs when metrics are not provided', async () => {
        const { worker } = makeWorker(false);
        await expect(worker.generateDailyJobs()).resolves.toBeUndefined();
    });
});
