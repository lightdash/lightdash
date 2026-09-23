import {
    ALL_TASK_NAMES,
    getSchedulerUuid,
    NotFoundError,
    SCHEDULER_TASKS,
    SchedulerFormat,
    SchedulerJobStatus,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { type SchedulerService } from '../services/SchedulerService/SchedulerService';
import { type SchedulerClient } from './SchedulerClient';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

class TestableSchedulerWorker extends SchedulerWorker {
    public getGenerateDailyJobsTask() {
        return this.getFullTaskList()[SCHEDULER_TASKS.GENERATE_DAILY_JOBS];
    }
}

const tracePayload = {
    organizationUuid: 'organization-uuid',
    projectUuid: 'project-uuid',
    userUuid: 'user-uuid',
};

const projectContext = {
    organizationUuid: 'organization-uuid',
    projectUuid: 'project-uuid',
    spaceUuid: 'space-uuid',
};

const makeScheduler = (schedulerUuid: string): SchedulerAndTargets => ({
    schedulerUuid,
    slug: schedulerUuid,
    name: schedulerUuid,
    createdAt: new Date('2026-09-16T12:00:00Z'),
    updatedAt: new Date('2026-09-16T12:00:00Z'),
    createdBy: `user-${schedulerUuid}`,
    createdByName: null,
    format: SchedulerFormat.CSV,
    cron: '0 9 * * *',
    savedChartUuid: `chart-${schedulerUuid}`,
    savedChartName: schedulerUuid,
    dashboardUuid: null,
    dashboardName: null,
    savedSqlUuid: null,
    savedSqlName: null,
    appUuid: null,
    appName: null,
    options: { formatted: true, limit: 'table' },
    enabled: true,
    includeLinks: true,
    plainTextEmail: false,
    targets: [],
});

const makeConfig = (dailyJobGenerationConcurrency: number): LightdashConfig =>
    ({
        scheduler: {
            tasks: [...ALL_TASK_NAMES],
            enabled: true,
            concurrency: 1,
            dailyJobGenerationConcurrency,
            pollInterval: 1_000,
            jobTimeout: 60_000,
            quiesce: {
                pollInterval: 2_000,
                gracePeriod: 180_000,
                resumeJitter: 60_000,
                resumeRampPeriod: 180_000,
            },
            queryHistory: {
                cleanup: {
                    enabled: false,
                    schedule: '0 0 * * *',
                    retentionDays: 30,
                    batchSize: 100,
                    delayMs: 0,
                    maxBatches: 1,
                },
            },
        },
        database: { connectionUri: 'postgres://noop' },
    }) as LightdashConfig;

const setup = (
    schedulers: SchedulerAndTargets[],
    dailyJobGenerationConcurrency = 2,
) => {
    const getAllSchedulers = vi.fn<SchedulerService['getAllSchedulers']>(
        async () => schedulers,
    );
    const getSchedulerProjectContext = vi.fn<
        SchedulerService['getSchedulerProjectContext']
    >(async () => projectContext);
    const getSchedulerDefaultTimezone = vi.fn<
        SchedulerService['getSchedulerDefaultTimezone']
    >(async () => 'UTC');
    const getSchedulerDefaultTimezoneForScheduler = vi.fn<
        SchedulerService['getSchedulerDefaultTimezoneForScheduler']
    >(async () => 'Europe/London');
    const logSchedulerJob = vi.fn<SchedulerService['logSchedulerJob']>(
        async () => undefined,
    );
    const generateDailyJobsForScheduler = vi.fn<
        SchedulerClient['generateDailyJobsForScheduler']
    >(async () => undefined);
    const getProjectSchedulerDetailsForPreAggregates = vi.fn(async () => []);
    const schedulerService = {
        getAllSchedulers,
        getSchedulerProjectContext,
        getSchedulerDefaultTimezone,
        getSchedulerDefaultTimezoneForScheduler,
        logSchedulerJob,
    } satisfies Pick<
        SchedulerService,
        | 'getAllSchedulers'
        | 'getSchedulerProjectContext'
        | 'getSchedulerDefaultTimezone'
        | 'getSchedulerDefaultTimezoneForScheduler'
        | 'logSchedulerJob'
    >;
    const schedulerClient = {
        generateDailyJobsForScheduler,
    } satisfies Pick<SchedulerClient, 'generateDailyJobsForScheduler'>;
    const worker = new TestableSchedulerWorker({
        lightdashConfig: makeConfig(dailyJobGenerationConcurrency),
        schedulerService: schedulerService as unknown as SchedulerService,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        preAggregateModel: {
            getProjectSchedulerDetailsForPreAggregates,
        },
        dailyJobRetryBackoffMs: [0, 0],
    } as unknown as SchedulerWorkerArguments);

    return {
        worker,
        getSchedulerProjectContext,
        getSchedulerDefaultTimezone,
        getSchedulerDefaultTimezoneForScheduler,
        logSchedulerJob,
        generateDailyJobsForScheduler,
    };
};

const runDailyJobs = async (worker: TestableSchedulerWorker) => {
    const task = worker.getGenerateDailyJobsTask();
    await task(tracePayload, {} as never);
};

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

describe('SchedulerWorker daily job generation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('bounds the whole per-scheduler workflow', async () => {
        const schedulers = ['one', 'two', 'three', 'four'].map(makeScheduler);
        const blockers = new Map(
            schedulers.map((scheduler) => [
                scheduler.schedulerUuid,
                deferred(),
            ]),
        );
        const { worker, getSchedulerProjectContext } = setup(schedulers, 2);

        getSchedulerProjectContext.mockImplementation(async (scheduler) => {
            await blockers.get(getSchedulerUuid(scheduler) ?? '')?.promise;
            return projectContext;
        });

        const run = runDailyJobs(worker);
        await vi.waitFor(() => {
            expect(getSchedulerProjectContext).toHaveBeenCalledTimes(2);
        });

        blockers.get('one')?.resolve();
        await vi.waitFor(() => {
            expect(getSchedulerProjectContext).toHaveBeenCalledTimes(3);
        });

        blockers.get('two')?.resolve();
        blockers.get('three')?.resolve();
        await vi.waitFor(() => {
            expect(getSchedulerProjectContext).toHaveBeenCalledTimes(4);
        });
        blockers.get('four')?.resolve();

        await run;
    });

    it('retries transient connection failures twice and reuses resolved context', async () => {
        const scheduler = makeScheduler('transient');
        const {
            worker,
            getSchedulerProjectContext,
            getSchedulerDefaultTimezoneForScheduler,
            generateDailyJobsForScheduler,
        } = setup([scheduler]);
        const transientError = new Error(
            'Knex: Timeout acquiring a connection',
        );
        transientError.name = 'KnexTimeoutError';
        generateDailyJobsForScheduler
            .mockRejectedValueOnce(transientError)
            .mockRejectedValueOnce(transientError)
            .mockResolvedValueOnce(undefined);

        await runDailyJobs(worker);

        expect(generateDailyJobsForScheduler).toHaveBeenCalledTimes(3);
        expect(getSchedulerProjectContext).toHaveBeenCalledOnce();
        expect(getSchedulerDefaultTimezoneForScheduler).toHaveBeenCalledOnce();
    });

    it('does not retry NotFoundError', async () => {
        const scheduler = makeScheduler('missing');
        const { worker, getSchedulerProjectContext, logSchedulerJob } = setup([
            scheduler,
        ]);
        getSchedulerProjectContext.mockRejectedValue(
            new NotFoundError('Chart not found'),
        );

        await expect(runDailyJobs(worker)).rejects.toThrow(
            'Failed to generate daily jobs for all schedulers',
        );

        expect(getSchedulerProjectContext).toHaveBeenCalledOnce();
        expect(logSchedulerJob).toHaveBeenCalledOnce();
    });

    it('writes an error log with generated job identifiers and known context', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-17T12:34:56Z'));
        const scheduler = makeScheduler('failed');
        const { worker, logSchedulerJob, generateDailyJobsForScheduler } =
            setup([scheduler]);
        generateDailyJobsForScheduler.mockRejectedValue(
            new Error('invalid schedule'),
        );

        await expect(runDailyJobs(worker)).rejects.toThrow(
            'Failed to generate daily jobs for all schedulers',
        );

        const loggedJob = vi.mocked(logSchedulerJob).mock.lastCall?.[0];
        expect(loggedJob).toMatchObject({
            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
            status: SchedulerJobStatus.ERROR,
            schedulerUuid: scheduler.schedulerUuid,
            scheduledTime: new Date('2026-09-17T00:00:00Z'),
            details: {
                error: 'invalid schedule',
                createdByUserUuid: scheduler.createdBy,
                projectUuid: projectContext.projectUuid,
                organizationUuid: projectContext.organizationUuid,
            },
        });
        expect(loggedJob?.jobId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(loggedJob?.jobGroup).toBe(loggedJob?.jobId);
    });

    it('uses the fetched scheduler row and computed context for timezone lookup', async () => {
        const scheduler = makeScheduler('single-fetch');
        const {
            worker,
            getSchedulerDefaultTimezone,
            getSchedulerDefaultTimezoneForScheduler,
        } = setup([scheduler]);

        await runDailyJobs(worker);

        expect(getSchedulerDefaultTimezone).not.toHaveBeenCalled();
        expect(getSchedulerDefaultTimezoneForScheduler).toHaveBeenCalledWith(
            scheduler,
            projectContext,
        );
    });

    it('does not mask the generation error when error logging fails', async () => {
        const scheduler = makeScheduler('log-failed');
        const { worker, logSchedulerJob, generateDailyJobsForScheduler } =
            setup([scheduler]);
        const error = vi.spyOn(Logger, 'error');
        generateDailyJobsForScheduler.mockRejectedValue(
            new Error('generation failed'),
        );
        const loggingError = new Error('Knex: Timeout acquiring a connection');
        loggingError.name = 'KnexTimeoutError';
        logSchedulerJob.mockRejectedValue(loggingError);

        await expect(runDailyJobs(worker)).rejects.toThrow(
            'Failed to generate daily jobs for all schedulers',
        );

        expect(logSchedulerJob).toHaveBeenCalledTimes(3);
        expect(error).toHaveBeenCalledWith(
            'Failed to generate daily jobs for scheduler log-failed with: Error: generation failed',
        );
    });

    it('caps failed scheduler UUIDs in the completion summary line', async () => {
        const failedSchedulerUuids = Array.from(
            { length: 21 },
            (_, index) => `failed-${index + 1}`,
        );
        const schedulers = [
            makeScheduler('successful'),
            ...failedSchedulerUuids.map(makeScheduler),
        ];
        const { worker, generateDailyJobsForScheduler } = setup(schedulers);
        const info = vi.spyOn(Logger, 'info');
        generateDailyJobsForScheduler.mockImplementation(async (scheduler) => {
            if (scheduler.schedulerUuid !== 'successful') {
                throw new Error('invalid schedule');
            }
        });

        await runDailyJobs(worker);

        expect(info).toHaveBeenCalledWith(
            `Completed generating daily jobs: 1 successful, 21 failed out of 22 total schedulers. Failed scheduler UUIDs (21, first 20): ${failedSchedulerUuids.slice(0, 20).join(', ')}`,
        );
    });
});
