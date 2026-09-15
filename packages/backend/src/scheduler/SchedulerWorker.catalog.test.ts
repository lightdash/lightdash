import {
    SCHEDULER_TASKS,
    SchedulerJobStatus,
    TimeoutError,
    type SchedulerIndexCatalogJobPayload,
} from '@lightdash/common';
import type { Job, JobHelpers } from 'graphile-worker';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import Logger from '../logging/logger';
import { SchedulerClient } from './SchedulerClient';
import { SchedulerWorker } from './SchedulerWorker';

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    captureException: vi.fn(),
}));

class TestWorker extends SchedulerWorker {
    runCatalog(payload: SchedulerIndexCatalogJobPayload, helpers: JobHelpers) {
        return this.getFullTaskList()[SCHEDULER_TASKS.INDEX_CATALOG](
            payload,
            helpers,
        );
    }
}

const payload: SchedulerIndexCatalogJobPayload = {
    userUuid: 'user',
    projectUuid: 'project',
    organizationUuid: 'organization',
    prevCatalogItemsWithTags: [],
    prevCatalogItemsWithIcons: [],
    prevMetricTreeEdges: [],
    prevMetricsTreeNodes: [],
};
const job = {
    id: 'job-id',
    locked_by: 'worker',
    task_identifier: SCHEDULER_TASKS.INDEX_CATALOG,
    run_at: new Date(),
} as Job;
const helpers = { job } as JobHelpers;

const setup = () => {
    const catalogService = {
        indexCatalog: vi.fn(async () => ({ catalogFieldMap: {} })),
        migrateCatalogItemTags: vi.fn(async () => undefined),
        migrateCatalogItemIcons: vi.fn(async () => undefined),
        migrateMetricsTreeEdges: vi.fn(async () => undefined),
        migrateMetricsTreeNodes: vi.fn(async () => undefined),
        setChartUsages: vi.fn(async (): Promise<void> => undefined),
    };
    const logSchedulerJob = vi.fn(async () => undefined);
    const worker = Object.create(TestWorker.prototype) as TestWorker;
    Object.assign(worker, {
        catalogService,
        schedulerService: { logSchedulerJob },
        lightdashConfig: {
            ...lightdashConfigMock,
            scheduler: {
                ...lightdashConfigMock.scheduler,
                jobTimeout: 100,
            },
        },
    });
    return { worker, catalogService, logSchedulerJob };
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger, 'error').mockImplementation(() => Logger);
    vi.spyOn(SchedulerClient, 'processJob').mockImplementation(
        async (_task, _id, _runAt, _payload, run) => run(),
    );
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('catalog indexing timeouts', () => {
    it('completes and records success before the deadline', async () => {
        const { worker, catalogService, logSchedulerJob } = setup();
        await worker.runCatalog(payload, helpers);
        expect(catalogService.setChartUsages).toHaveBeenCalledOnce();
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: SchedulerJobStatus.COMPLETED }),
        );
        expect(vi.getTimerCount()).toBe(0);
    });
    it.each(['indexCatalog', 'setChartUsages'] as const)(
        'drains a timed-out %s stage, rejects and never logs success',
        async (stage) => {
            const { worker, catalogService, logSchedulerJob } = setup();
            let finish: () => void = () => {};
            const pending = new Promise<void>((resolve) => {
                finish = resolve;
            });
            if (stage === 'indexCatalog') {
                catalogService.indexCatalog.mockImplementation(async () => {
                    await pending;
                    return { catalogFieldMap: {} };
                });
            } else {
                catalogService.setChartUsages.mockImplementation(
                    async () => pending,
                );
            }
            let settled = false;
            const guarded = worker.runCatalog(payload, helpers).finally(() => {
                settled = true;
            });
            const rejection = guarded.catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(100);
            expect(settled).toBe(false);
            finish();
            expect(await rejection).toBeInstanceOf(TimeoutError);
            expect(settled).toBe(true);
            if (stage === 'indexCatalog')
                expect(
                    catalogService.migrateCatalogItemTags,
                ).not.toHaveBeenCalled();
            expect(logSchedulerJob).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    status: SchedulerJobStatus.COMPLETED,
                }),
            );
            expect(logSchedulerJob).toHaveBeenLastCalledWith(
                expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
            );
            expect(vi.getTimerCount()).toBe(0);
        },
    );
    it('propagates ordinary indexing failures', async () => {
        const { worker, catalogService, logSchedulerJob } = setup();
        const error = new Error('index failed');
        catalogService.indexCatalog.mockRejectedValueOnce(error);
        await expect(worker.runCatalog(payload, helpers)).rejects.toBe(error);
        expect(catalogService.migrateCatalogItemTags).not.toHaveBeenCalled();
        expect(logSchedulerJob).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
        );
    });
    it('fails after a timed-out stage rejects without starting the next stage', async () => {
        const { worker, catalogService } = setup();
        let fail: (error: Error) => void = () => {};
        catalogService.indexCatalog.mockImplementation(
            () =>
                new Promise((_resolve, reject) => {
                    fail = reject;
                }),
        );
        const rejection = worker
            .runCatalog(payload, helpers)
            .catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(100);
        fail(new Error('database timeout'));
        expect(await rejection).toBeInstanceOf(TimeoutError);
        expect(catalogService.migrateCatalogItemTags).not.toHaveBeenCalled();
    });
});
