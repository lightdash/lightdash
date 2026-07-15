import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isAiDeepResearchRunTerminal,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    type AiDeepResearchArtifact,
    type AiDeepResearchBudget,
    type AiDeepResearchEffort,
    type AiDeepResearchEvent,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventsPage,
    type AiDeepResearchJobPayload,
    type AiDeepResearchPolicy,
    type AiDeepResearchPolicyInput,
    type AiDeepResearchProgress,
    type AiDeepResearchRun,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import {
    type AiDeepResearchRunEvent,
    type LightdashAnalytics,
} from '../../../analytics/LightdashAnalytics';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import {
    type DbAiDeepResearchEvent,
    type DbAiDeepResearchRun,
} from '../../database/entities/aiDeepResearch';
import {
    type AiDeepResearchRunModel,
    type DbAiDeepResearchEventWithCursor,
} from '../../models/AiDeepResearchRunModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { type AiAgentService } from '../AiAgentService/AiAgentService';

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
    | { status: 'completed'; artifact: AiDeepResearchArtifact }
    | { status: 'partially_completed'; artifact: AiDeepResearchArtifact }
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
    aiAgentService: Pick<
        AiAgentService,
        'createAgentThreadMessage' | 'getAgent' | 'interruptAgentThreadMessage'
    >;
    analytics: LightdashAnalytics;
    executor?: AiDeepResearchExecutor;
};

type EventCursorPayload = {
    createdAt: string;
    eventUuid: string;
};

const toRun = (row: DbAiDeepResearchRun): AiDeepResearchRun => ({
    aiDeepResearchRunUuid: row.ai_deep_research_run_uuid,
    projectUuid: row.project_uuid,
    agentUuid: row.agent_uuid,
    threadUuid: row.ai_thread_uuid,
    promptUuid: row.prompt_uuid,
    status: row.status,
    result: row.result,
    policy: row.policy_snapshot,
    executionContext: row.execution_context_snapshot,
    checkpoint: row.checkpoint,
    timings: row.timings,
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
        case 'phase_changed':
        case 'tool_call':
        case 'query_provenance':
        case 'checkpoint':
        case 'artifact_created':
            return {
                ...event,
                eventType: row.event_type,
                payload: row.payload,
            } as AiDeepResearchEvent;
        default:
            throw new Error('Unknown Deep Research event type');
    }
};

const encodeEventCursor = (event: DbAiDeepResearchEventWithCursor): string =>
    Buffer.from(
        JSON.stringify({
            createdAt: event.cursor_created_at,
            eventUuid: event.ai_deep_research_event_uuid,
        } satisfies EventCursorPayload),
    ).toString('base64url');

const decodeEventCursor = (
    cursor: string | undefined,
): EventCursorPayload | null => {
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

        const createdAt = new Date(`${parsed.createdAt.replace(' ', 'T')}Z`);
        if (
            !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(
                parsed.createdAt,
            ) ||
            Number.isNaN(createdAt.getTime()) ||
            !isValidUuid(parsed.eventUuid)
        ) {
            throw new Error('Invalid cursor values');
        }
        return { createdAt: parsed.createdAt, eventUuid: parsed.eventUuid };
    } catch {
        throw new ParameterError('Invalid Deep Research event cursor');
    }
};

export const AI_DEEP_RESEARCH_BUDGETS_BY_EFFORT: Record<
    AiDeepResearchEffort,
    AiDeepResearchBudget
> = {
    low: {
        maxRuntimeMs: 15 * 60 * 1_000,
        maxTokens: 500_000,
        maxToolCalls: 50,
        maxWarehouseQueries: 10,
        maxResultRows: 5_000,
    },
    medium: {
        maxRuntimeMs: 30 * 60 * 1_000,
        maxTokens: 1_000_000,
        maxToolCalls: 125,
        maxWarehouseQueries: 25,
        maxResultRows: 10_000,
    },
    high: {
        maxRuntimeMs: 45 * 60 * 1_000,
        maxTokens: 2_000_000,
        maxToolCalls: 250,
        maxWarehouseQueries: 50,
        maxResultRows: 25_000,
    },
    xhigh: {
        maxRuntimeMs: 55 * 60 * 1_000,
        maxTokens: 4_000_000,
        maxToolCalls: 500,
        maxWarehouseQueries: 100,
        maxResultRows: 50_000,
    },
};

export const AI_DEEP_RESEARCH_DEFAULT_EFFORT: AiDeepResearchEffort = 'medium';

export const AI_DEEP_RESEARCH_DEFAULT_BUDGET =
    AI_DEEP_RESEARCH_BUDGETS_BY_EFFORT[AI_DEEP_RESEARCH_DEFAULT_EFFORT];

export const AI_DEEP_RESEARCH_MAX_BUDGET =
    AI_DEEP_RESEARCH_BUDGETS_BY_EFFORT.xhigh;

const AI_DEEP_RESEARCH_DEFAULT_POLICY: AiDeepResearchPolicy = {
    instructions: null,
    maxSteps: 40,
    maxToolCalls: 125,
    maxWarehouseQueries: 25,
    maxRuntimeMs: 30 * 60 * 1_000,
};

const AI_DEEP_RESEARCH_MAX_POLICY: Omit<AiDeepResearchPolicy, 'instructions'> =
    {
        maxSteps: 40,
        maxToolCalls: 500,
        maxWarehouseQueries: 100,
        maxRuntimeMs: 60 * 60 * 1_000,
    };

const resolvePolicy = (
    input: AiDeepResearchPolicyInput | undefined,
): AiDeepResearchPolicy => {
    const policy = { ...AI_DEEP_RESEARCH_DEFAULT_POLICY, ...input };
    const invalidLimit = Object.entries(AI_DEEP_RESEARCH_MAX_POLICY).find(
        ([key, maximum]) => {
            const value =
                policy[key as keyof typeof AI_DEEP_RESEARCH_MAX_POLICY];
            return !Number.isInteger(value) || value < 1 || value > maximum;
        },
    );
    if (invalidLimit) {
        throw new ParameterError(
            `Deep Research ${invalidLimit[0]} must be a positive integer no greater than ${invalidLimit[1]}`,
        );
    }
    const instructions = policy.instructions?.trim() || null;
    return { ...policy, instructions };
};

const policyToBudget = (
    policy: AiDeepResearchPolicy,
): AiDeepResearchBudget => ({
    maxRuntimeMs: policy.maxRuntimeMs,
    maxTokens: AI_DEEP_RESEARCH_DEFAULT_BUDGET.maxTokens,
    maxToolCalls: policy.maxToolCalls,
    maxWarehouseQueries: policy.maxWarehouseQueries,
    maxResultRows: AI_DEEP_RESEARCH_DEFAULT_BUDGET.maxResultRows,
});

const getResearchPrompt = (
    question: string,
    policy: AiDeepResearchPolicy,
): string => `Conduct a Deep Research investigation as a single researcher.

Question:
${question}

Research policy:
- Maximum ${policy.maxSteps} reasoning/tool steps.
- Maximum ${policy.maxToolCalls} total tool calls.
- Maximum ${policy.maxWarehouseQueries} warehouse queries.
- Runtime limit ${policy.maxRuntimeMs} ms.
${policy.instructions ? `- Additional instructions: ${policy.instructions}` : ''}

Use the full context and tools attached to this AI Agent. Investigate competing explanations, validate claims against primary data, and distinguish observations from inference.

As your final action, call submitResearchArtifact exactly once. Populate every field, write finalReport as a clear Markdown report with a root-cause conclusion, and only include tool call IDs and query UUIDs that actually occurred. Do not invent evidence or provenance.`;

export class AiDeepResearchService extends BaseService {
    private readonly aiDeepResearchRunModel: AiDeepResearchRunModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly aiAgentService: Dependencies['aiAgentService'];

    private readonly analytics: LightdashAnalytics;

    private readonly executor: AiDeepResearchExecutor | undefined;

    constructor({
        aiDeepResearchRunModel,
        projectModel,
        featureFlagModel,
        schedulerClient,
        aiAgentService,
        analytics,
        executor,
    }: Dependencies) {
        super();
        this.aiDeepResearchRunModel = aiDeepResearchRunModel;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.schedulerClient = schedulerClient;
        this.aiAgentService = aiAgentService;
        this.analytics = analytics;
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

    private async assertCanCreateRun(
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
            ) ||
            ability.cannot(
                'create',
                subject('AiDeepResearch', { organizationUuid, projectUuid }),
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
        if (!run.agent_uuid) {
            throw new NotFoundError(
                `Deep Research run ${aiDeepResearchRunUuid} is no longer attached to an AI Agent`,
            );
        }
        await this.aiAgentService.getAgent(user, run.agent_uuid, projectUuid);
        return run;
    }

    async createRun(args: {
        user: SessionUser;
        projectUuid: string;
        prompt: string;
        agentUuid: string;
        threadUuid: string;
        policy?: AiDeepResearchPolicyInput;
    }): Promise<AiDeepResearchRun> {
        if (!isUserWithOrg(args.user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (args.prompt.trim().length === 0) {
            throw new ParameterError('Deep Research prompt is required');
        }
        const policy = resolvePolicy(args.policy);
        const budget = policyToBudget(policy);

        await this.assertCanCreateRun(args.user, args.projectUuid);
        const featureFlag = await this.featureFlagModel.get({
            user: args.user,
            featureFlagId: FeatureFlags.AiDeepResearch,
        });
        if (!featureFlag.enabled) {
            throw new ForbiddenError('Deep Research is not enabled');
        }

        await this.aiAgentService.getAgent(
            args.user,
            args.agentUuid,
            args.projectUuid,
        );
        const promptMessage =
            await this.aiAgentService.createAgentThreadMessage(
                args.user,
                args.agentUuid,
                args.threadUuid,
                {
                    prompt: getResearchPrompt(args.prompt.trim(), policy),
                    hidden: true,
                },
            );

        const run = await this.aiDeepResearchRunModel.create({
            organizationUuid: args.user.organizationUuid,
            projectUuid: args.projectUuid,
            createdByUserUuid: args.user.userUuid,
            agentUuid: args.agentUuid,
            aiThreadUuid: args.threadUuid,
            promptUuid: promptMessage.uuid,
            toolCallId: null,
            prompt: args.prompt.trim(),
            budget,
            policy,
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

        this.analytics.track<AiDeepResearchRunEvent>({
            event: 'ai_deep_research.run_started',
            userId: args.user.userUuid,
            properties: {
                organizationId: run.organization_uuid,
                projectId: run.project_uuid,
                agentId: args.agentUuid,
                threadId: args.threadUuid,
                runId: run.ai_deep_research_run_uuid,
                status: 'queued',
            },
        });

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
        const pageRows = rows.slice(0, limit);
        const events = pageRows.map(toEvent);
        return {
            events,
            nextCursor:
                pageRows.length > 0
                    ? encodeEventCursor(pageRows[pageRows.length - 1])
                    : (args.cursor ?? null),
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
        if (
            run.status === 'running' &&
            run.agent_uuid &&
            run.ai_thread_uuid &&
            run.prompt_uuid
        ) {
            await this.aiAgentService.interruptAgentThreadMessage(user, {
                agentUuid: run.agent_uuid,
                threadUuid: run.ai_thread_uuid,
                messageUuid: run.prompt_uuid,
            });
        }
        if (isAiDeepResearchRunTerminal(run.status)) {
            await this.trackTerminalRun(aiDeepResearchRunUuid);
        }
        return toRun(run);
    }

    async executeRun(
        payload: AiDeepResearchJobPayload,
        signal: AbortSignal = new AbortController().signal,
    ): Promise<void> {
        const run = await this.aiDeepResearchRunModel.claimRun(
            payload.aiDeepResearchRunUuid,
        );
        if (!run) {
            const currentRun = await this.aiDeepResearchRunModel.findByUuid(
                payload.aiDeepResearchRunUuid,
            );
            if (currentRun?.status === 'running') {
                throw new Error(
                    `Deep Research run ${payload.aiDeepResearchRunUuid} is already running`,
                );
            }
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
            await this.trackTerminalRun(payload.aiDeepResearchRunUuid);
            throw new Error('Deep Research executor is not configured');
        }

        try {
            const result = await this.executor(run, { signal });
            if (result.status === 'completed') {
                const completed =
                    await this.aiDeepResearchRunModel.markCompleted(
                        payload.aiDeepResearchRunUuid,
                        result.artifact,
                    );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                }
                await this.trackTerminalRun(payload.aiDeepResearchRunUuid);
                return;
            }
            if (result.status === 'partially_completed') {
                const completed =
                    await this.aiDeepResearchRunModel.markPartiallyCompleted(
                        payload.aiDeepResearchRunUuid,
                        result.artifact,
                    );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                }
                await this.trackTerminalRun(payload.aiDeepResearchRunUuid);
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
                await this.trackTerminalRun(payload.aiDeepResearchRunUuid);
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
            await this.trackTerminalRun(payload.aiDeepResearchRunUuid);
        } catch (error) {
            this.logger.error(
                `Deep Research run ${payload.aiDeepResearchRunUuid} threw: ${getErrorMessage(error)}`,
            );
            const currentRun = await this.aiDeepResearchRunModel.findByUuid(
                payload.aiDeepResearchRunUuid,
            );
            if (currentRun?.cancellation_requested_at) {
                await this.aiDeepResearchRunModel.markCancelled(
                    payload.aiDeepResearchRunUuid,
                );
                await this.trackTerminalRun(payload.aiDeepResearchRunUuid);
                return;
            }
            await this.aiDeepResearchRunModel.releaseForRetry(
                payload.aiDeepResearchRunUuid,
            );
            throw error;
        }
    }

    async markRunFailedAfterRetries(
        aiDeepResearchRunUuid: string,
    ): Promise<boolean> {
        const marked = await this.aiDeepResearchRunModel.markFailed(
            aiDeepResearchRunUuid,
            FAILED_RUN_ERROR_MESSAGE,
        );
        if (marked) {
            await this.trackTerminalRun(aiDeepResearchRunUuid);
        }
        return marked;
    }

    private async trackTerminalRun(
        aiDeepResearchRunUuid: string,
    ): Promise<void> {
        const run = await this.aiDeepResearchRunModel.findByUuid(
            aiDeepResearchRunUuid,
        );
        if (
            !run ||
            !run.agent_uuid ||
            !run.ai_thread_uuid ||
            !isAiDeepResearchRunTerminal(run.status)
        ) {
            return;
        }

        const timings =
            run.timings ??
            (() => {
                const terminalAt = run.completed_at ?? new Date();
                const queueMs = Math.max(
                    0,
                    (run.started_at ?? terminalAt).getTime() -
                        run.created_at.getTime(),
                );
                const totalMs = Math.max(
                    0,
                    terminalAt.getTime() - run.created_at.getTime(),
                );
                return {
                    queueMs,
                    agentMs: Math.max(0, totalMs - queueMs),
                    toolWaitMs: 0,
                    warehouseMs: 0,
                    artifactGenerationMs: 0,
                    totalMs,
                };
            })();
        if (!run.timings) {
            await this.aiDeepResearchRunModel.saveTimings(
                aiDeepResearchRunUuid,
                timings,
            );
        }

        this.analytics.track<AiDeepResearchRunEvent>({
            event: 'ai_deep_research.run_finished',
            userId: run.created_by_user_uuid,
            properties: {
                organizationId: run.organization_uuid,
                projectId: run.project_uuid,
                agentId: run.agent_uuid,
                threadId: run.ai_thread_uuid,
                runId: run.ai_deep_research_run_uuid,
                status: run.status,
                ...timings,
            },
        });
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
        const marked = await this.aiDeepResearchRunModel.markFailed(
            aiDeepResearchRunUuid,
            TIMED_OUT_RUN_ERROR_MESSAGE,
        );
        if (marked) {
            await this.trackTerminalRun(aiDeepResearchRunUuid);
        }
        return marked;
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
