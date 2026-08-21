import {
    AgentOnboardingPipelineJobPayload,
    AiAgentEditDbtProjectPipelineJobPayload,
    AiAgentEvalRunJobPayload,
    AiAgentMemoryConsolidatePartitionJobPayload,
    AiAgentMemoryDistillJobPayload,
    AiAgentReviewClassifierJobPayload,
    AiAgentReviewRemediationCompileJobPayload,
    AiAgentReviewRemediationPreviewJobPayload,
    AiAgentReviewRemediationRunJobPayload,
    AiAgentReviewWritebackJobPayload,
    AiDeepResearchPipelineJobPayload,
    AiWritebackPipelineJobPayload,
    AppBuildFromSourceJobPayload,
    AppGeneratePipelineJobPayload,
    EE_SCHEDULER_TASKS,
    EmbedArtifactVersionJobPayload,
    GenerateArtifactQuestionJobPayload,
    IngestExternalSourceJobPayload,
    JobPriority,
    PublishAnnouncementPayload,
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

/**
 * How long to defer an event-driven distill so a burst of activity on the same
 * thread (consecutive turns, rate-then-comment feedback) coalesces into one
 * distill via the shared per-thread jobKey. Long enough that a follow-up turn
 * usually completes (and re-arms the job) before the window expires — a distill
 * that fires while a turn is still in flight misses that turn's answer, since
 * response saves don't advance the thread watermark.
 */
const MEMORY_DISTILL_EVENT_DEBOUNCE_MS = 180_000;

export const aiAgentMemoryDistillEventRunAt = (now: Date): Date =>
    new Date(now.getTime() + MEMORY_DISTILL_EVENT_DEBOUNCE_MS);

export class CommercialSchedulerClient extends SchedulerClient {
    /**
     * One pending publish per announcement: the stable jobKey (default
     * jobKeyMode `replace`) makes rescheduling an in-place move of `runAt`.
     * maxAttempts 1 — the due-announcements sweep is the retry mechanism.
     */
    async schedulePublishAnnouncement(
        payload: PublishAnnouncementPayload,
        runAt: Date,
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.PUBLISH_ANNOUNCEMENT,
            payload,
            {
                runAt,
                maxAttempts: 1,
                jobKey: `announcement-publish:${payload.announcementUuid}`,
                priority: JobPriority.LOW,
            },
        );
        return { jobId };
    }

    async cancelPublishAnnouncement(announcementUuid: string): Promise<void> {
        const graphileClient = await this.graphileUtils;
        await graphileClient.withPgClient(async (pgClient) => {
            await pgClient.query(
                `DELETE FROM graphile_worker.jobs
                 WHERE locked_by IS NULL AND key = $1`,
                [`announcement-publish:${announcementUuid}`],
            );
        });
    }

    async aiAgentMemoryDistill(
        payload: AiAgentMemoryDistillJobPayload,
        runAt: Date = new Date(),
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_MEMORY_DISTILL,
            payload,
            {
                runAt,
                maxAttempts: 1,
                jobKey: `ai-agent-memory-distill:${payload.threadUuid}`,
                queueName: `ai-agent-memory-distill:${payload.projectUuid}`,
                priority: JobPriority.LOW,
            },
        );
        return { jobId };
    }

    async aiAgentMemoryConsolidatePartition(
        payload: AiAgentMemoryConsolidatePartitionJobPayload,
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.CONSOLIDATE_AI_AGENT_MEMORY_PARTITION,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `ai-agent-memory-consolidate:${payload.projectUuid}:${payload.ownerUserUuid}`,
                queueName: `ai-agent-memory-consolidate:${payload.projectUuid}`,
                priority: JobPriority.LOW,
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

    async aiAgentReviewRemediationPreview(
        payload: AiAgentReviewRemediationPreviewJobPayload,
        runAt: Date = new Date(),
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_PREVIEW,
            payload,
            {
                runAt,
                maxAttempts: 1,
                jobKey: `ai-agent-review-remediation-preview:${payload.remediationUuid}`,
            },
        );
        return { jobId };
    }

    async aiAgentReviewRemediationCompile(
        payload: AiAgentReviewRemediationCompileJobPayload,
        runAt: Date = new Date(),
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_COMPILE,
            payload,
            {
                runAt,
                maxAttempts: 1,
                jobKey: `ai-agent-review-remediation-compile:${payload.remediationUuid}`,
            },
        );
        return { jobId };
    }

    async aiAgentReviewRemediationRun(
        payload: AiAgentReviewRemediationRunJobPayload,
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `ai-agent-review-remediation-run:${payload.remediationUuid}`,
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

    async appBuildFromSource(payload: AppBuildFromSourceJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.APP_BUILD_FROM_SOURCE,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 2,
                jobKey: `app-build:${payload.appUuid}:${payload.version}`,
            },
        );
        return { jobId };
    }

    async aiWritebackPipeline(payload: AiWritebackPipelineJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_WRITEBACK_PIPELINE,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `ai-writeback:${payload.aiWritebackRunUuid}`,
            },
        );
        return { jobId };
    }

    async agentOnboardingRun(payload: AgentOnboardingPipelineJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AGENT_ONBOARDING_RUN,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `agent-onboarding:${payload.agentOnboardingRunUuid}`,
            },
        );
        return { jobId };
    }

    async aiDeepResearch(payload: AiDeepResearchPipelineJobPayload) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_DEEP_RESEARCH,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `ai-deep-research:${payload.aiDeepResearchRunUuid}`,
            },
        );
        return { jobId };
    }

    async ingestExternalSource(
        payload: IngestExternalSourceJobPayload,
        options: { runAt?: Date } = {},
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.INGEST_EXTERNAL_SOURCE,
            payload,
            {
                runAt: options.runAt ?? new Date(),
                maxAttempts: 5,
                jobKey: `external-source-ingest:${payload.attemptUuid}`,
            },
        );
        return { jobId };
    }

    async ingestExternalSourceAttachment(
        payload: IngestExternalSourceJobPayload,
        options: { runAt?: Date } = {},
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.INGEST_EXTERNAL_SOURCE_ATTACHMENT,
            payload,
            {
                runAt: options.runAt ?? new Date(),
                maxAttempts: 5,
                jobKey: `external-source-attachment-ingest:${payload.attemptUuid}`,
            },
        );
        return { jobId };
    }

    async aiAgentEditDbtProjectPipeline(
        payload: AiAgentEditDbtProjectPipelineJobPayload,
    ) {
        const graphileClient = await this.graphileUtils;
        const { id: jobId } = await graphileClient.addJob(
            EE_SCHEDULER_TASKS.AI_AGENT_EDIT_DBT_PROJECT_PIPELINE,
            payload,
            {
                runAt: new Date(),
                maxAttempts: 1,
                jobKey: `ai-agent-edit-dbt-project:${payload.aiWritebackRunUuid}`,
                // Run edits from the same thread one at a time, in order — a
                // second edit queues behind the first rather than racing it into
                // the "an edit is already in progress" workstream-lock rejection.
                queueName: `ai-writeback-thread:${payload.aiThreadUuid}`,
            },
        );
        return { jobId };
    }
}
