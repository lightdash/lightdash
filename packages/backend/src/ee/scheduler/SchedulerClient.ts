import {
    AiAgentEvalRunJobPayload,
    AiAgentReviewClassifierJobPayload,
    AiAgentReviewWritebackJobPayload,
    AppGeneratePipelineJobPayload,
    EE_SCHEDULER_TASKS,
    EmbedArtifactVersionJobPayload,
    GenerateArtifactQuestionJobPayload,
    PollWritebackPreviewJobPayload,
    SlackPromptJobPayload,
} from '@lightdash/common';
import { SchedulerClient } from '../../scheduler/SchedulerClient';

/**
 * How long to defer a feedback-driven review so a rate-then-comment pair (two
 * separate feedback requests) coalesces into one review via the shared jobKey.
 */
const FEEDBACK_REVIEW_DEBOUNCE_MS = 60_000;

/**
 * When a review for `eventType` should run. Feedback-driven reviews are deferred
 * so a rate-then-comment pair (two separate feedback requests) coalesces into a
 * single review via the shared jobKey — otherwise a review on the bare score
 * races a second review on the full feedback. Everything else runs immediately.
 */
export const aiAgentReviewRunAt = (
    eventType: AiAgentReviewClassifierJobPayload['eventType'],
    now: Date,
): Date =>
    eventType === 'feedback_changed'
        ? new Date(now.getTime() + FEEDBACK_REVIEW_DEBOUNCE_MS)
        : now;

export class CommercialSchedulerClient extends SchedulerClient {
    /**
     * Enqueue (or re-enqueue) a poll for a write-back PR's preview URL. Keyed by
     * prompt so a re-enqueue replaces the pending poll rather than stacking. Pass
     * a future `runAt` to delay the next poll.
     */
    async pollWritebackPreview(
        payload: PollWritebackPreviewJobPayload,
        runAt: Date = new Date(),
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.POLL_WRITEBACK_PREVIEW,
            payload,
            {
                runAt,
                maxAttempts: 1,
                jobKey: `poll-writeback-preview:${payload.promptUuid}`,
            },
        );
        return { jobId };
    }

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
        const runAt = aiAgentReviewRunAt(payload.eventType, new Date());
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_CLASSIFIER,
            payload,
            {
                runAt,
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
