import {
    AiAgentEvalRunJobPayload,
    EE_SCHEDULER_TASKS,
    EmbedArtifactVersionJobPayload,
    GenerateArtifactQuestionJobPayload,
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

    async aiAgentEvalResult(payload: AiAgentEvalRunJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        return { jobId };
    }

    async embedArtifactVersion(payload: EmbedArtifactVersionJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.EMBED_ARTIFACT_VERSION,
            payload,
            {
                runAt: now,
                maxAttempts: 3,
            },
        );
        return { jobId };
    }

    async generateArtifactQuestion(
        payload: GenerateArtifactQuestionJobPayload,
    ) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.GENERATE_ARTIFACT_QUESTION,
            payload,
            {
                runAt: now,
                maxAttempts: 3,
            },
        );
        return { jobId };
    }
}
