import {
    FeatureFlags,
    SchedulerAndTargets,
    TraceTaskBase,
    type PreAggregateMaterializationTrigger,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../config/parseConfig';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { SchedulerModel } from '../models/SchedulerModel';
import { getOrgDeliveryQueueName, SchedulerClient } from './SchedulerClient';

const { graphileAddJob } = vi.hoisted(() => ({
    graphileAddJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));

// The constructor eagerly calls makeWorkerUtils() to connect to graphile-worker;
// stub it so we can construct the client without a database.
vi.mock('graphile-worker', () => ({
    makeWorkerUtils: vi.fn().mockResolvedValue({
        addJob: graphileAddJob,
        withPgClient: vi.fn(),
    }),
}));

const ORG_UUID = 'org-1';

const makeClient = (allowMultiOrgs: boolean, get: import('vitest').Mock) =>
    new SchedulerClient({
        lightdashConfig: {
            allowMultiOrgs,
            database: { connectionUri: 'postgres://noop' },
        } as unknown as LightdashConfig,
        analytics: { track: vi.fn() } as unknown as LightdashAnalytics,
        schedulerModel: {
            logSchedulerJob: vi.fn().mockResolvedValue(undefined),
        } as unknown as SchedulerModel,
        featureFlagModel: { get } as unknown as FeatureFlagModel,
    });

const scheduler = {
    schedulerUuid: 'sched-1',
    name: 'test',
    cron: '0 * * * *', // hourly → 24 jobs for the test day
    timezone: 'UTC',
    enabled: true,
    createdBy: 'user-1',
    format: 'csv',
    targets: [],
} as unknown as SchedulerAndTargets;

const traceProperties: TraceTaskBase = {
    organizationUuid: ORG_UUID,
    projectUuid: 'proj-1',
    userUuid: 'user-1',
};

// A fixed start-of-day so getDailyDatesFromCron deterministically yields jobs.
const startingDateTime = new Date(2023, 0, 1);

describe('SchedulerClient per-org delivery queue', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('preserves the send-now execution user in the persisted job payload', async () => {
        const client = makeClient(false, vi.fn());

        await client.addScheduledDeliveryJob(
            new Date('2026-08-03T10:00:00Z'),
            {
                ...scheduler,
                ...traceProperties,
                userUuid: 'triggering-user',
                executionUserUuid: 'triggering-user',
            },
            scheduler.schedulerUuid,
        );

        expect(graphileAddJob).toHaveBeenCalledWith(
            'handleScheduledDelivery',
            expect.objectContaining({
                schedulerUuid: scheduler.schedulerUuid,
                userUuid: 'triggering-user',
                executionUserUuid: 'triggering-user',
            }),
            expect.any(Object),
        );
    });

    // App deliveries render through the headless browser (capture render), so
    // they need the same retry budget as dashboard image jobs.
    it('gives app deliveries a retry budget', async () => {
        const client = makeClient(false, vi.fn());

        await client.addScheduledDeliveryJob(
            new Date('2026-08-03T10:00:00Z'),
            {
                ...scheduler,
                ...traceProperties,
                savedChartUuid: null,
                dashboardUuid: null,
                savedSqlUuid: null,
                appUuid: 'app-1',
            },
            scheduler.schedulerUuid,
        );

        expect(graphileAddJob).toHaveBeenCalledWith(
            'handleScheduledDelivery',
            expect.any(Object),
            expect.objectContaining({ maxAttempts: 2 }),
        );
    });

    it('routes recurring deliveries into a per-org queue when multi-org + flag are on', async () => {
        const get = vi.fn().mockResolvedValue({
            id: FeatureFlags.ScheduledDeliveryPerOrgQueue,
            enabled: true,
        });
        const client = makeClient(true, get);
        const addJob = vi
            .spyOn(client, 'addScheduledDeliveryJob')
            .mockResolvedValue({ jobId: 'j1', date: new Date() });

        await client.generateDailyJobsForScheduler(
            scheduler,
            traceProperties,
            'UTC',
            startingDateTime,
        );

        expect(addJob).toHaveBeenCalled();
        expect(
            addJob.mock.calls.every(
                (call) => call[3] === getOrgDeliveryQueueName(ORG_UUID),
            ),
        ).toBe(true);
        // Flag evaluated per-org for the scheduler's user + organization.
        expect(get).toHaveBeenCalledWith({
            user: {
                userUuid: 'user-1',
                organizationUuid: ORG_UUID,
            },
            featureFlagId: FeatureFlags.ScheduledDeliveryPerOrgQueue,
        });
    });

    it('does not set a queue when the flag is off', async () => {
        const get = vi.fn().mockResolvedValue({
            id: FeatureFlags.ScheduledDeliveryPerOrgQueue,
            enabled: false,
        });
        const client = makeClient(true, get);
        const addJob = vi
            .spyOn(client, 'addScheduledDeliveryJob')
            .mockResolvedValue({ jobId: 'j1', date: new Date() });

        await client.generateDailyJobsForScheduler(
            scheduler,
            traceProperties,
            'UTC',
            startingDateTime,
        );

        expect(addJob).toHaveBeenCalled();
        expect(addJob.mock.calls.every((call) => call[3] === undefined)).toBe(
            true,
        );
    });

    it('skips the flag lookup entirely on single-tenant instances', async () => {
        const get = vi.fn();
        const client = makeClient(false, get);
        const addJob = vi
            .spyOn(client, 'addScheduledDeliveryJob')
            .mockResolvedValue({ jobId: 'j1', date: new Date() });

        await client.generateDailyJobsForScheduler(
            scheduler,
            traceProperties,
            'UTC',
            startingDateTime,
        );

        expect(get).not.toHaveBeenCalled();
        expect(addJob).toHaveBeenCalled();
        expect(addJob.mock.calls.every((call) => call[3] === undefined)).toBe(
            true,
        );
    });

    // The create path passes no startingDateTime, so the window is measured
    // from "now" — a cron firing later today must still be enqueued.
    it('enqueues the fires left today when called minutes before one', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-03T09:57:00Z'));
        try {
            const client = makeClient(false, vi.fn());
            const addJob = vi
                .spyOn(client, 'addScheduledDeliveryJob')
                .mockResolvedValue({ jobId: 'j1', date: new Date() });

            await client.generateDailyJobsForScheduler(
                { ...scheduler, cron: '0 10 * * *' },
                traceProperties,
                'UTC',
            );

            expect(addJob).toHaveBeenCalledTimes(1);
            expect(addJob.mock.calls[0][0].toISOString()).toBe(
                '2026-08-03T10:00:00.000Z',
            );
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('SchedulerClient create project job lookup', () => {
    afterEach(() => vi.restoreAllMocks());

    it('finds a queued create project job by its Lightdash job UUID', async () => {
        const client = makeClient(false, vi.fn());
        const query = vi.fn().mockResolvedValue({
            rows: [{ exists: true }],
        });
        client.graphileUtils = Promise.resolve({
            withPgClient: async (
                callback: (client: { query: typeof query }) => unknown,
            ) => callback({ query }),
        } as unknown as Awaited<typeof client.graphileUtils>);

        await expect(
            client.hasCreateProjectWithCompileJob('lightdash-job-uuid'),
        ).resolves.toBe(true);
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining("payload->>'jobUuid' = $2"),
            ['createProjectWithCompile', 'lightdash-job-uuid'],
        );
    });
});

describe('SchedulerClient pre-aggregate materialization jobs', () => {
    const definition = {
        organizationUuid: ORG_UUID,
        projectUuid: 'proj-1',
        createdByUserUuid: 'user-1',
        preAggregateDefinitionUuid: 'definition-1',
        refreshCron: '0 10 * * *',
        schedulerTimezone: 'UTC',
        scheduleRevision: 'revision-2',
    };

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it.each<PreAggregateMaterializationTrigger>([
        'compile',
        'cron',
        'manual',
        'webhook',
    ])(
        'serializes %s in the definition queue without changing coalescing',
        async (trigger) => {
            const client = makeClient(false, vi.fn());
            const scheduledAt = new Date('2026-09-14T10:00:00Z');

            await client.materializePreAggregate(
                {
                    ...traceProperties,
                    preAggregateDefinitionUuid:
                        definition.preAggregateDefinitionUuid,
                    trigger,
                    ...(trigger === 'cron' && {
                        scheduleRevision: definition.scheduleRevision,
                    }),
                },
                scheduledAt,
            );

            expect(graphileAddJob).toHaveBeenCalledWith(
                'materializePreAggregate',
                expect.objectContaining({ trigger }),
                expect.objectContaining({
                    queueName: 'preagg:definition-1',
                    maxAttempts: 1,
                    jobKey:
                        trigger === 'cron'
                            ? `preagg:definition-1:cron:${scheduledAt.getTime()}`
                            : `preagg:definition-1:${trigger}`,
                }),
            );
        },
    );

    it('cancels pending jobs before scheduling the remaining current-day fires with the new revision', async () => {
        const client = makeClient(false, vi.fn());
        const cancel = vi
            .spyOn(client, 'deleteScheduledPreAggregateCronJobsForDefinition')
            .mockResolvedValue();

        await client.reconcilePreAggregateCronSchedule(
            {
                preAggregateDefinitionUuid:
                    definition.preAggregateDefinitionUuid,
                definition,
            },
            new Date('2026-09-14T09:57:00Z'),
        );

        expect(cancel).toHaveBeenCalledWith('definition-1');
        expect(graphileAddJob).toHaveBeenCalledExactlyOnceWith(
            'materializePreAggregate',
            expect.objectContaining({
                trigger: 'cron',
                scheduleRevision: 'revision-2',
            }),
            expect.objectContaining({
                runAt: new Date('2026-09-14T10:00:00Z'),
            }),
        );
        expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
            graphileAddJob.mock.invocationCallOrder[0],
        );
    });

    it('only cancels pending jobs when the definition is no longer schedulable', async () => {
        const client = makeClient(false, vi.fn());
        const cancel = vi
            .spyOn(client, 'deleteScheduledPreAggregateCronJobsForDefinition')
            .mockResolvedValue();

        await client.reconcilePreAggregateCronSchedule({
            preAggregateDefinitionUuid: definition.preAggregateDefinitionUuid,
            definition: null,
        });

        expect(cancel).toHaveBeenCalledWith('definition-1');
        expect(graphileAddJob).not.toHaveBeenCalled();
    });

    it('uses project scheduler timezone when reconciling', async () => {
        const client = makeClient(false, vi.fn());
        vi.spyOn(
            client,
            'deleteScheduledPreAggregateCronJobsForDefinition',
        ).mockResolvedValue();

        await client.reconcilePreAggregateCronSchedule(
            {
                preAggregateDefinitionUuid:
                    definition.preAggregateDefinitionUuid,
                definition: { ...definition, schedulerTimezone: 'Asia/Tokyo' },
            },
            new Date('2026-09-14T00:30:00Z'),
        );

        expect(graphileAddJob).toHaveBeenCalledExactlyOnceWith(
            'materializePreAggregate',
            expect.any(Object),
            expect.objectContaining({
                runAt: new Date('2026-09-14T01:00:00Z'),
            }),
        );
    });
});
