import {
    AiAgentEvalRunJobPayload,
    AiAgentReviewClassifierJobPayload,
    AiAgentReviewWritebackJobPayload,
    EmbedArtifactVersionJobPayload,
    GenerateArtifactQuestionJobPayload,
    SlackPromptJobPayload,
} from '@lightdash/ai';
import {
    AppGeneratePipelineJobPayload,
    EE_SCHEDULER_TASKS,
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

    async aiAgentReviewClassifier(payload: AiAgentReviewClassifierJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER,
            payload,
            {
                runAt: now,
                maxAttempts: 1,
                jobKey: `ai-agent-review:${payload.eventType}:${payload.promptUuid}`,
            },
        );
        return { jobId };
    }

    async aiAgentReviewWriteback(payload: AiAgentReviewWritebackJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_WRITEBACK,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `ai-agent-review-writeback:${payload.fingerprint}`,
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

    async appGeneratePipeline(payload: AppGeneratePipelineJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.APP_GENERATE_PIPELINE,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 2,
                jobKey: `app-generate:${payload.appUuid}:${payload.version}`,
            },
        );
        return { jobId };
    }
}
