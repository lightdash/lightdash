import { SlackPromptJobPayload } from '@lightdash/common';
import { SchedulerClient } from '../../scheduler/SchedulerClient';

export class CommercialSchedulerClient extends SchedulerClient {
    async slackAiPrompt(payload: SlackPromptJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob('aiPrompt', payload, {
            runAt: now, // now
            maxAttempts: 1,
        });
        return { jobId };
    }
}
