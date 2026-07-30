import {
    ALL_TASK_NAMES,
    EE_SCHEDULER_TASKS,
    type AiDeepResearchPipelineJobPayload,
} from '@lightdash/common';
import type { Job } from 'graphile-worker';
import { afterEach, vi } from 'vitest';
import { type LightdashConfig } from '../../config/parseConfig';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { AI_DEEP_RESEARCH_SCHEDULER_WATCHDOG_MS } from '../services/AiDeepResearchService/AiDeepResearchTimeout';
import { CommercialSchedulerWorker } from './SchedulerWorker';

class TestableCommercialSchedulerWorker extends CommercialSchedulerWorker {
    public exposeFullTaskList() {
        return this.getFullTaskList();
    }
}

const makeWorker = (
    executeRun: (payload: AiDeepResearchPipelineJobPayload) => Promise<void>,
    markRunTimedOut = vi.fn().mockResolvedValue(undefined),
) =>
    new TestableCommercialSchedulerWorker({
        lightdashConfig: {
            scheduler: {
                tasks: [...ALL_TASK_NAMES],
            },
        } as unknown as LightdashConfig,
        aiDeepResearchService: { executeRun, markRunTimedOut },
    } as never);

const job = {
    id: 'job-id',
    locked_by: 'worker-id',
    task_identifier: EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH,
    run_at: new Date('2026-07-30T12:00:00.000Z'),
} as Job;

const payload = {
    aiDeepResearchRunUuid: 'run-1',
} as AiDeepResearchPipelineJobPayload;

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('CommercialSchedulerWorker — Deep Research timeout', () => {
    it('leaves the service hard deadline uncontested and releases at the later watchdog', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(job.run_at);
        vi.spyOn(SchedulerClient, 'processJob').mockImplementation(
            async (_task, _jobId, _runAt, _payload, execute) => execute(),
        );
        const executeRun = vi.fn(async () => new Promise<void>(() => {}));
        const markRunTimedOut = vi.fn().mockResolvedValue(undefined);
        const task = makeWorker(
            executeRun,
            markRunTimedOut,
        ).exposeFullTaskList()[EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH];
        const execution = task(payload, { job } as never);

        await vi.advanceTimersByTimeAsync(
            AI_DEEP_RESEARCH_SCHEDULER_WATCHDOG_MS - 1,
        );
        expect(markRunTimedOut).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await execution;

        expect(executeRun).toHaveBeenCalledOnce();
        expect(markRunTimedOut).toHaveBeenCalledExactlyOnceWith('run-1');
    });

    it('releases without waiting for emergency finalization or late execution', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(job.run_at);
        vi.spyOn(SchedulerClient, 'processJob').mockImplementation(
            async (_task, _jobId, _runAt, _payload, execute) => execute(),
        );
        let rejectExecution: (error: Error) => void = () => {};
        const executeRun = vi.fn(
            async () =>
                new Promise<void>((_resolve, reject) => {
                    rejectExecution = reject;
                }),
        );
        const markRunTimedOut = vi.fn(async () => new Promise<void>(() => {}));
        const task = makeWorker(
            executeRun,
            markRunTimedOut,
        ).exposeFullTaskList()[EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH];
        const execution = task(payload, { job } as never);

        await vi.advanceTimersByTimeAsync(
            AI_DEEP_RESEARCH_SCHEDULER_WATCHDOG_MS,
        );
        await execution;

        expect(markRunTimedOut).toHaveBeenCalledExactlyOnceWith('run-1');
        rejectExecution(new Error('late provider rejection'));
        await vi.runAllTimersAsync();
    });
});
