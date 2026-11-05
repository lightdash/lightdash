import { SCHEDULER_TASKS } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CommercialSchedulerWorker } from './SchedulerWorker';

vi.mock('../services/ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class {},
}));

it('isolates analytics content jobs and delegates organization scopes to the existing service', async () => {
    const analyticsProjectService = {
        reconcileContent: vi.fn().mockResolvedValue(undefined),
        syncContent: vi.fn().mockResolvedValue(undefined),
    };
    const tasks = [
        SCHEDULER_TASKS.RECONCILE_ANALYTICS_CONTENT,
        SCHEDULER_TASKS.SYNC_ANALYTICS_CONTENT,
    ];
    const worker = new CommercialSchedulerWorker({
        lightdashConfig: {
            ...lightdashConfigMock,
            scheduler: { ...lightdashConfigMock.scheduler, tasks },
        },
        analyticsProjectService,
    } as unknown as ConstructorParameters<typeof CommercialSchedulerWorker>[0]);
    const handlers = worker['getFullTaskList']();
    expect(Object.keys(worker['getTaskList']()).sort()).toEqual(
        [...tasks].sort(),
    );
    expect(worker['getEnabledCronItems']()).toEqual([]);
    await handlers[SCHEDULER_TASKS.RECONCILE_ANALYTICS_CONTENT](
        {},
        {} as never,
    );
    expect(
        analyticsProjectService.reconcileContent,
    ).toHaveBeenCalledExactlyOnceWith({ organizationUuid: null });
    await handlers[SCHEDULER_TASKS.SYNC_ANALYTICS_CONTENT](
        { organizationUuid: 'org-1' },
        {} as never,
    );
    expect(analyticsProjectService.syncContent).toHaveBeenCalledExactlyOnceWith(
        { organizationUuid: 'org-1' },
    );
});
