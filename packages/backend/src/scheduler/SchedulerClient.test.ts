import {
    FeatureFlags,
    SchedulerAndTargets,
    TraceTaskBase,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../config/parseConfig';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { SchedulerModel } from '../models/SchedulerModel';
import { getOrgDeliveryQueueName, SchedulerClient } from './SchedulerClient';

// The constructor eagerly calls makeWorkerUtils() to connect to graphile-worker;
// stub it so we can construct the client without a database.
jest.mock('graphile-worker', () => ({
    makeWorkerUtils: jest
        .fn()
        .mockResolvedValue({ addJob: jest.fn(), withPgClient: jest.fn() }),
}));

const ORG_UUID = 'org-1';

const makeClient = (allowMultiOrgs: boolean, get: jest.Mock) =>
    new SchedulerClient({
        lightdashConfig: {
            allowMultiOrgs,
            database: { connectionUri: 'postgres://noop' },
        } as unknown as LightdashConfig,
        analytics: { track: jest.fn() } as unknown as LightdashAnalytics,
        schedulerModel: {
            logSchedulerJob: jest.fn().mockResolvedValue(undefined),
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
    afterEach(() => jest.restoreAllMocks());

    it('routes recurring deliveries into a per-org queue when multi-org + flag are on', async () => {
        const get = jest.fn().mockResolvedValue({
            id: FeatureFlags.ScheduledDeliveryPerOrgQueue,
            enabled: true,
        });
        const client = makeClient(true, get);
        const addJob = jest
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
        const get = jest.fn().mockResolvedValue({
            id: FeatureFlags.ScheduledDeliveryPerOrgQueue,
            enabled: false,
        });
        const client = makeClient(true, get);
        const addJob = jest
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
        const get = jest.fn();
        const client = makeClient(false, get);
        const addJob = jest
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
});
