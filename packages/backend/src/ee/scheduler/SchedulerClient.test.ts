import { AnyType, EE_SCHEDULER_TASKS, JobPriority } from '@lightdash/common';
import {
    aiAgentMemoryDistillEventRunAt,
    aiAgentReviewRunAt,
    CommercialSchedulerClient,
} from './SchedulerClient';

describe('aiAgentReviewRunAt', () => {
    const now = new Date('2026-06-04T11:33:48.000Z');

    it('defers feedback_changed reviews so a rate-then-comment pair coalesces', () => {
        const runAt = aiAgentReviewRunAt('feedback_changed', now);
        // Delayed by the debounce window so the shared jobKey can replace the
        // still-pending job when the comment arrives shortly after the rating.
        expect(runAt.getTime() - now.getTime()).toBe(60_000);
    });

    it('runs response_saved reviews immediately', () => {
        const runAt = aiAgentReviewRunAt('response_saved', now);
        expect(runAt.getTime()).toBe(now.getTime());
    });
});

describe('aiAgentMemoryDistillEventRunAt', () => {
    it('defers event-driven distills so a burst of thread activity coalesces', () => {
        const now = new Date('2026-06-04T11:33:48.000Z');
        const runAt = aiAgentMemoryDistillEventRunAt(now);
        // Delayed so the per-thread jobKey replaces the still-pending job when
        // the next turn or the feedback comment lands shortly after.
        expect(runAt.getTime() - now.getTime()).toBe(180_000);
    });
});

describe('CommercialSchedulerClient.aiDeepResearch', () => {
    it('enqueues one uniquely keyed attempt per durable run', async () => {
        const addJob = vi.fn().mockResolvedValue({ id: 'job-1' });
        const client = Object.create(
            CommercialSchedulerClient.prototype,
        ) as CommercialSchedulerClient;
        client.graphileUtils = Promise.resolve({ addJob } as AnyType);
        const payload = {
            aiDeepResearchRunUuid: 'run-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            userUuid: 'user-1',
        };

        await client.aiDeepResearch(payload);

        expect(addJob).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH,
            payload,
            expect.objectContaining({
                maxAttempts: 1,
                jobKey: 'ai-deep-research:run-1',
            }),
        );
    });
});

describe('CommercialSchedulerClient.aiAgentMemoryDistill', () => {
    it('enqueues one keyed attempt per thread', async () => {
        const addJob = vi.fn().mockResolvedValue({ id: 'job-1' });
        const client = Object.create(
            CommercialSchedulerClient.prototype,
        ) as CommercialSchedulerClient;
        client.graphileUtils = Promise.resolve({ addJob } as AnyType);
        const payload = {
            threadUuid: 'thread-1',
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            userUuid: 'system',
            sweptUpdatedAt: '2026-07-22T05:00:00.000Z',
        };

        await client.aiAgentMemoryDistill(payload);

        expect(addJob).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.AI_AGENT_MEMORY_DISTILL,
            payload,
            expect.objectContaining({
                maxAttempts: 1,
                jobKey: 'ai-agent-memory-distill:thread-1',
                queueName: 'ai-agent-memory-distill:project-1',
                priority: JobPriority.LOW,
            }),
        );
    });

    it('schedules an event-driven distill at the debounced runAt', async () => {
        const addJob = vi.fn().mockResolvedValue({ id: 'job-1' });
        const client = Object.create(
            CommercialSchedulerClient.prototype,
        ) as CommercialSchedulerClient;
        client.graphileUtils = Promise.resolve({ addJob } as AnyType);
        const runAt = new Date('2026-06-04T11:34:48.000Z');

        await client.aiAgentMemoryDistill(
            {
                threadUuid: 'thread-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            },
            runAt,
        );

        expect(addJob).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.AI_AGENT_MEMORY_DISTILL,
            expect.not.objectContaining({ sweptUpdatedAt: expect.anything() }),
            expect.objectContaining({
                runAt,
                jobKey: 'ai-agent-memory-distill:thread-1',
            }),
        );
    });
});

describe('CommercialSchedulerClient.aiAgentMemoryConsolidatePartition', () => {
    it('enqueues one keyed attempt per partition on the project queue', async () => {
        const addJob = vi.fn().mockResolvedValue({ id: 'job-1' });
        const client = Object.create(
            CommercialSchedulerClient.prototype,
        ) as CommercialSchedulerClient;
        client.graphileUtils = Promise.resolve({ addJob } as AnyType);
        const payload = {
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            userUuid: 'system',
            ownerUserUuid: 'owner-1',
        };

        await client.aiAgentMemoryConsolidatePartition(payload);

        expect(addJob).toHaveBeenCalledWith(
            EE_SCHEDULER_TASKS.CONSOLIDATE_AI_AGENT_MEMORY_PARTITION,
            payload,
            expect.objectContaining({
                maxAttempts: 1,
                jobKey: 'ai-agent-memory-consolidate:project-1:owner-1',
                queueName: 'ai-agent-memory-consolidate:project-1',
                priority: JobPriority.LOW,
            }),
        );
    });
});
