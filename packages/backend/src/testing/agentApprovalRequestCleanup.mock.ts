import { ALL_TASK_NAMES, SCHEDULER_TASKS } from '@lightdash/common';
import { type AgentConnectionApprovalRequestModel } from '../models/AgentConnectionApprovalRequestModel';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from '../scheduler/SchedulerWorker';

class ApprovalRequestCleanupWorker extends SchedulerWorker {
    public cronItems() {
        return this.getCronItems();
    }

    public cleanupTask() {
        return this.getTaskList()[
            SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS
        ]!;
    }
}

export const approvalRequestCleanupWorker = (
    model: Pick<AgentConnectionApprovalRequestModel, 'deleteExpiredBatch'>,
    maxBatches?: number,
    tasks: readonly string[] = ALL_TASK_NAMES,
) =>
    new ApprovalRequestCleanupWorker({
        lightdashConfig: {
            scheduler: {
                tasks: [...tasks],
                queryHistory: { cleanup: { schedule: '0 0 * * *' } },
            },
        },
        agentConnectionApprovalRequestModel: model,
        approvalRequestCleanupMaxBatches: maxBatches,
    } as unknown as SchedulerWorkerArguments);

export const runApprovalRequestCleanup = (
    worker: ApprovalRequestCleanupWorker,
) =>
    worker.cleanupTask()(
        { organizationUuid: 'org', projectUuid: 'project', userUuid: 'user' },
        {} as never,
    );
