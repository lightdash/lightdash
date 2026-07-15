import {
    ALL_TASK_NAMES,
    AnyType,
    EE_SCHEDULER_TASKS,
    type AiDeepResearchPipelineJobPayload,
} from '@lightdash/common';
import { type LightdashConfig } from '../../config/parseConfig';
import { CommercialSchedulerWorker } from './SchedulerWorker';

class TestableCommercialSchedulerWorker extends CommercialSchedulerWorker {
    public exposeFullTaskList() {
        return this.getFullTaskList();
    }
}

const AI_DEEP_RESEARCH_TIMEOUT_MS = 65 * 60 * 1000;

const makeConfig = (): LightdashConfig =>
    ({
        scheduler: {
            tasks: [...ALL_TASK_NAMES],
            concurrency: 1,
            pollInterval: 1000,
            jobTimeout: 60_000,
        },
        database: { connectionUri: 'postgres://noop' },
    }) as unknown as LightdashConfig;

const payload: AiDeepResearchPipelineJobPayload = {
    aiDeepResearchRunUuid: 'run-1',
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    userUuid: 'user-1',
} as AiDeepResearchPipelineJobPayload;

const makeHelpers = (attempts: number, maxAttempts: number) =>
    ({
        job: {
            id: 'job-1',
            run_at: new Date('2026-07-15T12:00:00.000Z'),
            attempts,
            max_attempts: maxAttempts,
            task_identifier: EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH,
            locked_by: 'worker-1',
        },
    }) as AnyType;

const buildWorker = () => {
    const aiDeepResearchService = {
        executeRun: vi.fn().mockResolvedValue(undefined),
        markRunTimedOut: vi.fn().mockResolvedValue(true),
        markRunFailedAfterRetries: vi.fn().mockResolvedValue(true),
    };
    const worker = new TestableCommercialSchedulerWorker({
        lightdashConfig: makeConfig(),
        schedulerClient: { graphileUtils: Promise.resolve({}) },
        aiDeepResearchService,
    } as AnyType);
    const deepResearchTask = worker.exposeFullTaskList()[
        EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH
    ] as (payload: AnyType, helpers: AnyType) => Promise<void>;

    return { aiDeepResearchService, deepResearchTask };
};

describe('CommercialSchedulerWorker aiDeepResearch task', () => {
    it('marks the run failed and rethrows once Graphile retries are exhausted', async () => {
        const { aiDeepResearchService, deepResearchTask } = buildWorker();
        aiDeepResearchService.executeRun.mockRejectedValue(
            new Error('provider unavailable'),
        );

        await expect(
            deepResearchTask(payload, makeHelpers(3, 3)),
        ).rejects.toThrow('provider unavailable');

        expect(
            aiDeepResearchService.markRunFailedAfterRetries,
        ).toHaveBeenCalledWith('run-1');
    });

    it('rethrows without a terminal mark while attempts remain', async () => {
        const { aiDeepResearchService, deepResearchTask } = buildWorker();
        aiDeepResearchService.executeRun.mockRejectedValue(
            new Error('provider unavailable'),
        );

        await expect(
            deepResearchTask(payload, makeHelpers(1, 3)),
        ).rejects.toThrow('provider unavailable');

        expect(
            aiDeepResearchService.markRunFailedAfterRetries,
        ).not.toHaveBeenCalled();
        expect(aiDeepResearchService.markRunTimedOut).not.toHaveBeenCalled();
    });

    it('aborts the execution signal and marks the run timed out on job timeout', async () => {
        vi.useFakeTimers();
        try {
            const { aiDeepResearchService, deepResearchTask } = buildWorker();
            let executionSignal: AbortSignal | undefined;
            aiDeepResearchService.executeRun.mockImplementation(
                (_payload: AnyType, signal: AbortSignal) => {
                    executionSignal = signal;
                    return new Promise(() => {
                        // hangs until the timeout fires
                    });
                },
            );

            const task = deepResearchTask(payload, makeHelpers(1, 3));
            await vi.advanceTimersByTimeAsync(AI_DEEP_RESEARCH_TIMEOUT_MS);
            await task;

            expect(executionSignal?.aborted).toBe(true);
            expect(aiDeepResearchService.markRunTimedOut).toHaveBeenCalledWith(
                'run-1',
            );
            expect(
                aiDeepResearchService.markRunFailedAfterRetries,
            ).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
