import {
    ALL_TASK_NAMES,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
    type OnboardingProfilePayload,
    type OnboardingSemanticPayload,
} from '@lightdash/common';
import { SchedulerClient } from './SchedulerClient';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

class TestableSchedulerWorker extends SchedulerWorker {
    public exposeFullTaskList() {
        return this.getFullTaskList();
    }
}

const payload: OnboardingProfilePayload = {
    createdByUserUuid: 'user-uuid',
    userUuid: 'user-uuid',
    organizationUuid: 'organization-uuid',
    projectUuid: 'project-uuid',
    jobUuid: 'job-uuid',
};

const semanticPayload: OnboardingSemanticPayload = payload;

describe('SchedulerWorker onboarding profile task', () => {
    it('registers the task and runs the profile service through the worker', async () => {
        const sessionUser = { userUuid: payload.userUuid };
        const runProfileJob = vi.fn(async () => undefined);
        const logSchedulerJob = vi.fn(async () => undefined);
        const worker = new TestableSchedulerWorker({
            lightdashConfig: {
                scheduler: { tasks: [...ALL_TASK_NAMES] },
            },
            projectProfileService: { runProfileJob },
            schedulerService: { logSchedulerJob },
            userService: {
                getSessionByUserUuid: vi.fn(async () => sessionUser),
            },
        } as unknown as SchedulerWorkerArguments);
        const processJob = vi
            .spyOn(SchedulerClient, 'processJob')
            .mockImplementation(async (_task, _id, _runAt, _payload, run) =>
                run(),
            );
        const handler =
            worker.exposeFullTaskList()[SCHEDULER_TASKS.ONBOARDING_PROFILE];

        await handler?.(payload, {
            job: {
                id: 'graphile-job-uuid',
                run_at: new Date('2026-07-13T12:00:00.000Z'),
            },
        } as never);

        expect(processJob).toHaveBeenCalledWith(
            SCHEDULER_TASKS.ONBOARDING_PROFILE,
            'graphile-job-uuid',
            new Date('2026-07-13T12:00:00.000Z'),
            payload,
            expect.any(Function),
        );
        expect(runProfileJob).toHaveBeenCalledWith(sessionUser, payload);
        expect(logSchedulerJob).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ status: SchedulerJobStatus.STARTED }),
        );
        expect(logSchedulerJob).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ status: SchedulerJobStatus.COMPLETED }),
        );
    });

    it('registers the semantic task and runs the generation service through the worker', async () => {
        const sessionUser = { userUuid: semanticPayload.userUuid };
        const runGenerationJob = vi.fn(async () => undefined);
        const logSchedulerJob = vi.fn(async () => undefined);
        const worker = new TestableSchedulerWorker({
            lightdashConfig: {
                scheduler: { tasks: [...ALL_TASK_NAMES] },
            },
            semanticGenerationService: { runGenerationJob },
            schedulerService: { logSchedulerJob },
            userService: {
                getSessionByUserUuid: vi.fn(async () => sessionUser),
            },
        } as unknown as SchedulerWorkerArguments);
        const processJob = vi
            .spyOn(SchedulerClient, 'processJob')
            .mockImplementation(async (_task, _id, _runAt, _payload, run) =>
                run(),
            );
        const handler =
            worker.exposeFullTaskList()[SCHEDULER_TASKS.ONBOARDING_SEMANTIC];

        await handler?.(semanticPayload, {
            job: {
                id: 'graphile-job-uuid',
                run_at: new Date('2026-07-13T12:00:00.000Z'),
            },
        } as never);

        expect(processJob).toHaveBeenCalledWith(
            SCHEDULER_TASKS.ONBOARDING_SEMANTIC,
            'graphile-job-uuid',
            new Date('2026-07-13T12:00:00.000Z'),
            semanticPayload,
            expect.any(Function),
        );
        expect(runGenerationJob).toHaveBeenCalledWith(
            sessionUser,
            semanticPayload,
        );
        expect(logSchedulerJob).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ status: SchedulerJobStatus.STARTED }),
        );
        expect(logSchedulerJob).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ status: SchedulerJobStatus.COMPLETED }),
        );
    });
});
