import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isAiDeepResearchRunTerminal,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    type AiDeepResearchBudget,
    type AiDeepResearchEvent,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventsPage,
    type AiDeepResearchJobPayload,
    type AiDeepResearchProgress,
    type AiDeepResearchReport,
    type AiDeepResearchRun,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import {
    type DbAiDeepResearchEvent,
    type DbAiDeepResearchRun,
} from '../../database/entities/aiDeepResearch';
import { type AiDeepResearchRunModel } from '../../models/AiDeepResearchRunModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';

const MAX_EVENT_PAGE_SIZE = 100;
const DEFAULT_EVENT_PAGE_SIZE = 50;
const STALE_RUN_THRESHOLD_MINUTES = 75;
const STALE_RUN_ERROR_MESSAGE =
    'Deep Research stopped unexpectedly before it could finish.';
const FAILED_RUN_ERROR_MESSAGE =
    'Deep Research could not finish. Please try again.';
const TIMED_OUT_RUN_ERROR_MESSAGE =
    'Deep Research took too long to finish. Please try again.';

export type AiDeepResearchExecutorResult =
    | { status: 'completed'; report: AiDeepResearchReport }
    | { status: 'partially_completed'; report: AiDeepResearchReport }
    | { status: 'failed'; errorMessage: string }
    | { status: 'cancelled' };

export type AiDeepResearchExecutor = (
    run: DbAiDeepResearchRun,
    context: { signal: AbortSignal },
) => Promise<AiDeepResearchExecutorResult>;

type Dependencies = {
    aiDeepResearchRunModel: AiDeepResearchRunModel;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    schedulerClient: CommercialSchedulerClient;
    executor?: AiDeepResearchExecutor;
};

type EventCursorPayload = {
    createdAt: string;
    eventUuid: string;
};

const toRun = (row: DbAiDeepResearchRun): AiDeepResearchRun => ({
    aiDeepResearchRunUuid: row.ai_deep_research_run_uuid,
    projectUuid: row.project_uuid,
    status: row.status,
    result: row.result,
    budget: row.budget_snapshot,
    errorMessage: row.error_message,
    cancellationRequestedAt:
        row.cancellation_requested_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
});

const toEvent = (row: DbAiDeepResearchEvent): AiDeepResearchEvent => {
    const event = {
        aiDeepResearchEventUuid: row.ai_deep_research_event_uuid,
        aiDeepResearchRunUuid: row.ai_deep_research_run_uuid,
        createdAt: row.created_at.toISOString(),
    };

    switch (row.event_type) {
        case 'status_changed':
            return {
                ...event,
                eventType: row.event_type,
                payload:
                    row.payload as AiDeepResearchEventPayloadMap['status_changed'],
            };
        case 'cancellation_requested':
            return {
                ...event,
                eventType: row.event_type,
                payload:
                    row.payload as AiDeepResearchEventPayloadMap['cancellation_requested'],
            };
        case 'progress':
            return {
                ...event,
                eventType: row.event_type,
                payload:
                    row.payload as AiDeepResearchEventPayloadMap['progress'],
            };
        default:
            throw new Error('Unknown Deep Research event type');
    }
};

const encodeEventCursor = (event: AiDeepResearchEvent): string =>
    Buffer.from(
        JSON.stringify({
            createdAt: event.createdAt,
            eventUuid: event.aiDeepResearchEventUuid,
        } satisfies EventCursorPayload),
    ).toString('base64url');

const decodeEventCursor = (
    cursor: string | undefined,
): { createdAt: Date; eventUuid: string } | null => {
    if (!cursor) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(
            Buffer.from(cursor, 'base64url').toString('utf8'),
        );
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('createdAt' in parsed) ||
            !('eventUuid' in parsed) ||
            typeof parsed.createdAt !== 'string' ||
            typeof parsed.eventUuid !== 'string'
        ) {
            throw new Error('Invalid cursor payload');
        }

        const createdAt = new Date(parsed.createdAt);
        if (
            Number.isNaN(createdAt.getTime()) ||
            !isValidUuid(parsed.eventUuid)
        ) {
            throw new Error('Invalid cursor values');
        }
        return { createdAt, eventUuid: parsed.eventUuid };
    } catch {
        throw new ParameterError('Invalid Deep Research event cursor');
    }
};

export const AI_DEEP_RESEARCH_MAX_BUDGET: AiDeepResearchBudget = {
    maxRuntimeMs: 60 * 60 * 1_000,
    maxTokens: 500_000,
    maxToolCalls: 500,
    maxWarehouseQueries: 200,
    maxResultRows: 10_000,
};

const assertValidBudget = (budget: AiDeepResearchBudget): void => {
    if (
        Object.values(budget).some(
            (value) => !Number.isInteger(value) || value <= 0,
        )
    ) {
        throw new ParameterError(
            'Deep Research budget limits must be positive integers',
        );
    }
    const exceededBudget = Object.entries(budget).find(
        ([key, value]) =>
            value >
            AI_DEEP_RESEARCH_MAX_BUDGET[key as keyof AiDeepResearchBudget],
    );
    if (exceededBudget) {
        throw new ParameterError(
            `Deep Research ${exceededBudget[0]} exceeds the server limit`,
        );
    }
};

export class AiDeepResearchService extends BaseService {
    private readonly aiDeepResearchRunModel: AiDeepResearchRunModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly executor: AiDeepResearchExecutor | undefined;

    constructor({
        aiDeepResearchRunModel,
        projectModel,
        featureFlagModel,
        schedulerClient,
        executor,
    }: Dependencies) {
        super();
        this.aiDeepResearchRunModel = aiDeepResearchRunModel;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.schedulerClient = schedulerClient;
        this.executor = executor;
    }

    private async assertCanViewProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async findCreatorOwnedRun(
        user: SessionUser,
        projectUuid: string,
        aiDeepResearchRunUuid: string,
    ): Promise<DbAiDeepResearchRun> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const run = await this.aiDeepResearchRunModel.findByUuidScoped({
            aiDeepResearchRunUuid,
            organizationUuid: user.organizationUuid,
            projectUuid,
        });
        if (!run || run.created_by_user_uuid !== user.userUuid) {
            throw new NotFoundError(
                `Deep Research run ${aiDeepResearchRunUuid} not found`,
            );
        }

        await this.assertCanViewProject(user, projectUuid);
        return run;
    }

    async createRun(args: {
        user: SessionUser;
        projectUuid: string;
        prompt: string;
        budget: AiDeepResearchBudget;
        aiThreadUuid?: string;
        promptUuid?: string;
        toolCallId?: string;
    }): Promise<AiDeepResearchRun> {
        if (!isUserWithOrg(args.user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (args.prompt.trim().length === 0) {
            throw new ParameterError('Deep Research prompt is required');
        }
        assertValidBudget(args.budget);

        await this.assertCanViewProject(args.user, args.projectUuid);
        const featureFlag = await this.featureFlagModel.get({
            user: args.user,
            featureFlagId: FeatureFlags.AiDeepResearch,
        });
        if (!featureFlag.enabled) {
            throw new ForbiddenError('Deep Research is not enabled');
        }

        const run = await this.aiDeepResearchRunModel.create({
            organizationUuid: args.user.organizationUuid,
            projectUuid: args.projectUuid,
            createdByUserUuid: args.user.userUuid,
            aiThreadUuid: args.aiThreadUuid ?? null,
            promptUuid: args.promptUuid ?? null,
            toolCallId: args.toolCallId ?? null,
            prompt: args.prompt.trim(),
            budget: args.budget,
        });

        try {
            await this.schedulerClient.aiDeepResearch({
                aiDeepResearchRunUuid: run.ai_deep_research_run_uuid,
                organizationUuid: run.organization_uuid,
                projectUuid: run.project_uuid,
                userUuid: run.created_by_user_uuid,
            });
        } catch (error) {
            this.logger.error(
                `Failed to enqueue Deep Research run ${run.ai_deep_research_run_uuid}: ${getErrorMessage(error)}`,
            );
            await this.aiDeepResearchRunModel.markFailed(
                run.ai_deep_research_run_uuid,
                FAILED_RUN_ERROR_MESSAGE,
            );
            throw error;
        }

        return toRun(run);
    }

    async getRun(
        user: SessionUser,
        projectUuid: string,
        aiDeepResearchRunUuid: string,
    ): Promise<AiDeepResearchRun> {
        return toRun(
            await this.findCreatorOwnedRun(
                user,
                projectUuid,
                aiDeepResearchRunUuid,
            ),
        );
    }

    async listEvents(args: {
        user: SessionUser;
        projectUuid: string;
        aiDeepResearchRunUuid: string;
        cursor?: string;
        limit?: number;
    }): Promise<AiDeepResearchEventsPage> {
        await this.findCreatorOwnedRun(
            args.user,
            args.projectUuid,
            args.aiDeepResearchRunUuid,
        );

        const limit = args.limit ?? DEFAULT_EVENT_PAGE_SIZE;
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > MAX_EVENT_PAGE_SIZE
        ) {
            throw new ParameterError(
                `Deep Research event limit must be between 1 and ${MAX_EVENT_PAGE_SIZE}`,
            );
        }

        const rows = await this.aiDeepResearchRunModel.listEvents({
            aiDeepResearchRunUuid: args.aiDeepResearchRunUuid,
            cursor: decodeEventCursor(args.cursor),
            limit,
        });
        const events = rows.slice(0, limit).map(toEvent);
        return {
            events,
            nextCursor:
                rows.length > limit && events.length > 0
                    ? encodeEventCursor(events[events.length - 1])
                    : null,
        };
    }

    async cancelRun(
        user: SessionUser,
        projectUuid: string,
        aiDeepResearchRunUuid: string,
    ): Promise<AiDeepResearchRun> {
        await this.findCreatorOwnedRun(
            user,
            projectUuid,
            aiDeepResearchRunUuid,
        );
        const run = await this.aiDeepResearchRunModel.requestCancellation(
            aiDeepResearchRunUuid,
        );
        if (!run) {
            throw new NotFoundError(
                `Deep Research run ${aiDeepResearchRunUuid} not found`,
            );
        }
        return toRun(run);
    }

    async executeRun(
        payload: AiDeepResearchJobPayload,
        signal: AbortSignal = new AbortController().signal,
    ): Promise<void> {
        const run = await this.aiDeepResearchRunModel.claimQueuedRun(
            payload.aiDeepResearchRunUuid,
        );
        if (!run) {
            this.logger.info(
                `Deep Research run ${payload.aiDeepResearchRunUuid} was already claimed or is terminal`,
            );
            return;
        }

        if (!this.executor) {
            await this.aiDeepResearchRunModel.markFailed(
                payload.aiDeepResearchRunUuid,
                'Deep Research executor is not configured',
            );
            throw new Error('Deep Research executor is not configured');
        }

        try {
            const result = await this.executor(run, { signal });
            if (result.status === 'completed') {
                const completed =
                    await this.aiDeepResearchRunModel.markCompleted(
                        payload.aiDeepResearchRunUuid,
                        result.report,
                    );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                }
                return;
            }
            if (result.status === 'partially_completed') {
                const completed =
                    await this.aiDeepResearchRunModel.markPartiallyCompleted(
                        payload.aiDeepResearchRunUuid,
                        result.report,
                    );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                }
                return;
            }
            if (result.status === 'failed') {
                this.logger.error(
                    `Deep Research run ${payload.aiDeepResearchRunUuid} failed: ${result.errorMessage}`,
                );
                await this.aiDeepResearchRunModel.markFailed(
                    payload.aiDeepResearchRunUuid,
                    FAILED_RUN_ERROR_MESSAGE,
                );
                return;
            }

            const cancelled = await this.aiDeepResearchRunModel.markCancelled(
                payload.aiDeepResearchRunUuid,
            );
            if (!cancelled) {
                await this.aiDeepResearchRunModel.markFailed(
                    payload.aiDeepResearchRunUuid,
                    'Deep Research stopped without a cancellation request',
                );
            }
        } catch (error) {
            this.logger.error(
                `Deep Research run ${payload.aiDeepResearchRunUuid} threw: ${getErrorMessage(error)}`,
            );
            await this.aiDeepResearchRunModel.markFailed(
                payload.aiDeepResearchRunUuid,
                FAILED_RUN_ERROR_MESSAGE,
            );
            throw error;
        }
    }

    private async markCancelledAfterCompletedExecution(
        aiDeepResearchRunUuid: string,
    ): Promise<void> {
        const run = await this.aiDeepResearchRunModel.findByUuid(
            aiDeepResearchRunUuid,
        );
        if (
            run &&
            !isAiDeepResearchRunTerminal(run.status) &&
            run.cancellation_requested_at
        ) {
            await this.aiDeepResearchRunModel.markCancelled(
                aiDeepResearchRunUuid,
            );
        }
    }

    async markRunTimedOut(aiDeepResearchRunUuid: string): Promise<boolean> {
        return this.aiDeepResearchRunModel.markFailed(
            aiDeepResearchRunUuid,
            TIMED_OUT_RUN_ERROR_MESSAGE,
        );
    }

    async setClaudeSessionId(
        aiDeepResearchRunUuid: string,
        claudeSessionId: string,
    ): Promise<boolean> {
        return this.aiDeepResearchRunModel.setClaudeSessionId(
            aiDeepResearchRunUuid,
            claudeSessionId,
        );
    }

    async appendProgressEvent(
        aiDeepResearchRunUuid: string,
        progress: AiDeepResearchProgress,
    ): Promise<boolean> {
        return this.aiDeepResearchRunModel.appendProgressEvent(
            aiDeepResearchRunUuid,
            progress,
        );
    }

    async touch(aiDeepResearchRunUuid: string): Promise<boolean> {
        return this.aiDeepResearchRunModel.touch(aiDeepResearchRunUuid);
    }

    async sweepStaleRuns(): Promise<number> {
        const runs = await this.aiDeepResearchRunModel.markStaleRunsAsFailed(
            STALE_RUN_THRESHOLD_MINUTES,
            STALE_RUN_ERROR_MESSAGE,
        );
        if (runs.length > 0) {
            this.logger.warn(
                `Swept ${runs.length} stale Deep Research run(s) after ${STALE_RUN_THRESHOLD_MINUTES} minutes`,
            );
        }
        return runs.length;
    }
}
