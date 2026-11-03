import { SCHEDULER_TASKS } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialSchedulerWorker } from './SchedulerWorker';

vi.mock('../services/ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class {},
}));

const makeWorker = () => {
    const analyticsProjectService = {
        reconcileContent: vi.fn().mockResolvedValue(undefined),
        syncContent: vi.fn().mockResolvedValue(undefined),
    };
    const worker = new CommercialSchedulerWorker({
        lightdashConfig: {
            ...lightdashConfigMock,
            scheduler: {
                ...lightdashConfigMock.scheduler,
                tasks: [
                    SCHEDULER_TASKS.RECONCILE_ANALYTICS_CONTENT,
                    SCHEDULER_TASKS.SYNC_ANALYTICS_CONTENT,
                ],
            },
        },
        analyticsProjectService,
    } as unknown as ConstructorParameters<typeof CommercialSchedulerWorker>[0]);
    return { worker, analyticsProjectService };
};

describe('dedicated analytics content worker', () => {
    it('claims only reconciliation and content sync and registers no compaction cron', () => {
        const { worker } = makeWorker();
        expect(Object.keys(worker['getTaskList']()).sort()).toEqual(
            [
                SCHEDULER_TASKS.RECONCILE_ANALYTICS_CONTENT,
                SCHEDULER_TASKS.SYNC_ANALYTICS_CONTENT,
            ].sort(),
        );
        expect(worker['getEnabledCronItems']()).toEqual([]);
    });

    it.each([null, 'org-1'])(
        'passes reconciliation scope %s to the service',
        async (organizationUuid) => {
            const { worker, analyticsProjectService } = makeWorker();
            await worker['getFullTaskList']()[
                SCHEDULER_TASKS.RECONCILE_ANALYTICS_CONTENT
            ]({ organizationUuid }, {} as never);
            expect(
                analyticsProjectService.reconcileContent,
            ).toHaveBeenCalledExactlyOnceWith({ organizationUuid });
            expect(analyticsProjectService.syncContent).not.toHaveBeenCalled();
        },
    );

    it('passes the exact organization/project to sync and preserves errors for job retry', async () => {
        const { worker, analyticsProjectService } = makeWorker();
        const failure = new Error('content sync failed');
        analyticsProjectService.syncContent.mockRejectedValueOnce(failure);
        const payload = { organizationUuid: 'org-1', projectUuid: 'project-1' };
        await expect(
            worker['getFullTaskList']()[SCHEDULER_TASKS.SYNC_ANALYTICS_CONTENT](
                payload,
                {} as never,
            ),
        ).rejects.toBe(failure);
        expect(
            analyticsProjectService.syncContent,
        ).toHaveBeenCalledExactlyOnceWith(payload);
        expect(analyticsProjectService.reconcileContent).not.toHaveBeenCalled();
    });
});
