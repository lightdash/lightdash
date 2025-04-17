import {
    DownloadCsvPayload,
    EE_SCHEDULER_TASKS,
    SCHEDULER_TASKS,
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

    async downloadCsvJob(payload: Omit<DownloadCsvPayload, 'userUuid'>) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            SCHEDULER_TASKS.DOWNLOAD_CSV,
            payload,
            {
                runAt: now,
                maxAttempts: 1,
            },
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.DOWNLOAD_CSV,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: undefined,
                projectUuid: payload.projectUuid,
                exploreId: payload.exploreId,
                metricQuery: payload.metricQuery,
                organizationUuid: payload.organizationUuid,
            },
        });

        return { jobId };
    }

    async getCsvUrl(jobId: string) {
        const job = await this.schedulerModel.getCsvUrl(jobId, null, true);

        // -> check user permissions

        // -> check job error

        return job;
    }
}
