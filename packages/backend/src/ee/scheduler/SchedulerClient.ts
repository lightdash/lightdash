import {
    AiAgentThreadGenerateJobPayload,
    EE_SCHEDULER_TASKS,
    SchedulerJobStatus,
    SlackPromptJobPayload,
} from '@lightdash/common';
import { SchedulerClient } from '../../scheduler/SchedulerClient';

export class CommercialSchedulerClient extends SchedulerClient {
    async slackAiPrompt(payload: SlackPromptJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.SLACK_AI_PROMPT,
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        return { jobId };
    }

    async aiAgentThreadGenerate(payload: AiAgentThreadGenerateJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_THREAD_GENERATE,
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        // We need this for polling from frontend
        await this.schedulerModel.logSchedulerJob({
            task: EE_SCHEDULER_TASKS.AI_AGENT_THREAD_GENERATE,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                ...payload,
            },
        });
        return { jobId };
    }
}
