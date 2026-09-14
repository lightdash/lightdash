import { subject } from '@casl/ability';
import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AI_DEEP_RESEARCH_EVIDENCE_MAX_QUERIES,
    AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS,
    AI_DEEP_RESEARCH_MAX_CHARTS,
    AI_DEEP_RESEARCH_MAX_WORKERS,
    AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME,
    aiDeepResearchWorkerFindingsInputSchema,
    AiResultType,
    applyDeepResearchChartRefsWithAdjustments,
    buildDeepResearchVizConfig,
    ConflictError,
    derivePivotConfigurationFromChart,
    findDeepResearchChartRefs,
    ForbiddenError,
    getErrorMessage,
    getGroupByDimensions,
    getWebAiChartConfig,
    isAiDeepResearchEvidencePackEmpty,
    isAiDeepResearchRunTerminal,
    isUserWithOrg,
    lintDeepResearchReport,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    sleep,
    toolRunQueryArgsSchemaPersisted,
    UnexpectedServerError,
    type Account,
    type AiAgentToolResult,
    type AiDeepResearchBudget,
    type AiDeepResearchChartData,
    type AiDeepResearchEntryPoint,
    type AiDeepResearchEvent,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventsPage,
    type AiDeepResearchEvidencePack,
    type AiDeepResearchEvidenceQuery,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchFailureStage,
    type AiDeepResearchJobPayload,
    type AiDeepResearchProgress,
    type AiDeepResearchReportAdjustment,
    type AiDeepResearchRun,
    type AiDeepResearchTerminalReason,
    type AiDeepResearchTerminalStatus,
    type AiDeepResearchWarehouseChart,
    type ApiAiAgentThreadMessageVizQuery,
    type PivotConfiguration,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import {
    type DbAiDeepResearchAnalyticsOutbox,
    type DbAiDeepResearchEvent,
    type DbAiDeepResearchRun,
} from '../../database/entities/aiDeepResearch';
import { type AiAgentModel } from '../../models/AiAgentModel';
import {
    AiDeepResearchActiveRunError,
    AiDeepResearchPromptExecutionModeError,
    type AiDeepResearchRunModel,
    type DbAiDeepResearchEventWithCursor,
} from '../../models/AiDeepResearchRunModel';
import { type AiOrganizationSettingsModel } from '../../models/AiOrganizationSettingsModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { convertQueryResultsToCsv } from '../ai/utils/convertQueryResultsToCsv';
import { type AiAgentService } from '../AiAgentService/AiAgentService';
import { AI_DEEP_RESEARCH_STALE_RUN_THRESHOLD_MINUTES } from './constants';
import { resolveDeepResearchWarehouseChart } from './resolveDeepResearchWarehouseChart';
import {
    isDeepResearchEvidenceQueryTool,
    isDeepResearchRawSqlTool,
} from './toolClassification';

const MAX_EVENT_PAGE_SIZE = 100;
const DEFAULT_EVENT_PAGE_SIZE = 50;
const REPORT_FINALIZATION_RETRY_DELAYS_MS = [100, 500] as const;
const STALE_RUN_ERROR_MESSAGE =
    'Deep Research stopped unexpectedly before it could finish.';
const FAILED_RUN_ERROR_MESSAGE =
    'Deep Research could not finish. Please try again.';
const REPORT_ADJUSTED_WARNING =
    '<warning title="Report adjusted">Some chart evidence was omitted because it could not be verified. The remaining narrative and verified evidence are preserved.</warning>';

const retryReportFinalization = async <T>(
    operation: () => Promise<T>,
    onRetry: (error: unknown, attempt: number) => void,
    attempt = 0,
): Promise<T> => {
    try {
        return await operation();
    } catch (error) {
        const delay = REPORT_FINALIZATION_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
            throw error;
        }
        onRetry(error, attempt + 1);
        await sleep(delay);
        return retryReportFinalization(operation, onRetry, attempt + 1);
    }
};

const addReportAdjustedWarning = (markdown: string): string => {
    const reportTitle = markdown.match(/^# +.+$/m);
    if (!reportTitle || reportTitle.index === undefined) {
        return `${REPORT_ADJUSTED_WARNING}\n\n${markdown}`;
    }

    const reportTitleEnd = reportTitle.index + reportTitle[0].length;
    return `${markdown.slice(
        0,
        reportTitleEnd,
    )}\n\n${REPORT_ADJUSTED_WARNING}${markdown.slice(reportTitleEnd)}`;
};

const getCompletionClass = (
    status: DbAiDeepResearchRun['status'],
    hasReport: boolean,
): 'strict_success' | 'useful_partial' | 'empty_failure' | 'cancelled' => {
    if (status === 'completed') return 'strict_success';
    if (status === 'partially_completed' && hasReport) {
        return 'useful_partial';
    }
    if (status === 'cancelled') return 'cancelled';
    return 'empty_failure';
};

const getReportQuality = (run: DbAiDeepResearchRun) => {
    const hasReport =
        (run.status === 'completed' || run.status === 'partially_completed') &&
        run.result_markdown !== null;
    const structureValid = hasReport
        ? lintDeepResearchReport(run.result_markdown ?? '').length === 0
        : false;
    const evidenceGrounded = hasReport && (run.findings_count ?? 0) > 0;
    const reproducible = hasReport && (run.warehouse_query_count ?? 0) > 0;
    let qualityClass: 'none' | 'strong' | 'partial';
    if (!hasReport) {
        qualityClass = 'none';
    } else if (structureValid && evidenceGrounded && reproducible) {
        qualityClass = 'strong';
    } else {
        qualityClass = 'partial';
    }

    return {
        structureValid,
        evidenceGrounded,
        reproducible,
        qualityClass,
    };
};

const getFailureCategory = (
    reason: AiDeepResearchTerminalReason | null,
): 'none' | 'user' | 'budget' | 'provider' | 'data' | 'internal' => {
    if (reason === null) return 'none';
    if (reason === 'user_cancellation') return 'user';
    if (reason === 'provider_error') return 'provider';
    if (reason === 'no_relevant_data') return 'data';
    if (
        reason === 'tool_limit' ||
        reason === 'query_limit' ||
        reason === 'token_limit' ||
        reason === 'time_limit'
    ) {
        return 'budget';
    }
    return 'internal';
};
export const AI_DEEP_RESEARCH_NO_RELEVANT_DATA_ERROR_MESSAGE =
    'Deep Research could not find relevant data for this question.';
const isToolResultFailure = (toolResult: AiAgentToolResult | null): boolean => {
    if (toolResult === null) {
        return true;
    }
    const { metadata } = toolResult;
    if (
        metadata !== null &&
        typeof metadata === 'object' &&
        'status' in metadata &&
        metadata.status === 'error'
    ) {
        return true;
    }
    if (toolResult.toolType !== 'mcp') {
        return false;
    }
    try {
        const result: unknown = JSON.parse(toolResult.result);
        return (
            result !== null &&
            typeof result === 'object' &&
            'isError' in result &&
            result.isError === true
        );
    } catch {
        return false;
    }
};
const getQueryUuidFromMetadata = (metadata: unknown): string | null =>
    metadata !== null &&
    typeof metadata === 'object' &&
    'queryUuid' in metadata &&
    typeof metadata.queryUuid === 'string'
        ? metadata.queryUuid
        : null;
const isChartConfigCompatible = (
    chart: AiDeepResearchWarehouseChart,
    metricQuery: {
        dimensions: string[];
        metrics: string[];
        tableCalculations?: Array<{ name: string }> | null;
    },
): boolean => {
    const dimensions = new Set(metricQuery.dimensions);
    const metrics = new Set([
        ...metricQuery.metrics,
        ...(metricQuery.tableCalculations ?? []).map(({ name }) => name),
    ]);
    const { chartConfig } = chart;
    const referencedDimensions = [
        chartConfig.xAxisDimension,
        ...(chartConfig.groupBy ?? []),
    ].filter((field): field is string => field !== null);
    const referencedMetrics = [
        ...(chartConfig.yAxisMetrics ?? []),
        chartConfig.secondaryYAxisMetric,
    ].filter((field): field is string => field !== null);

    if (
        referencedDimensions.some((field) => !dimensions.has(field)) ||
        referencedMetrics.some((field) => !metrics.has(field))
    ) {
        return false;
    }

    return (
        chartConfig.defaultVizType === 'table' ||
        (chartConfig.xAxisDimension !== null &&
            (chartConfig.yAxisMetrics?.length ?? 0) > 0)
    );
};

export type AiDeepResearchSubmittedReport = {
    markdown: string;
};

export type AiDeepResearchEvidenceBuildResult = {
    evidencePack: AiDeepResearchEvidencePack;
    hasEvidenceBuildFailures: boolean;
};

export class AiDeepResearchExecutorStageError extends Error {
    readonly name = 'AiDeepResearchExecutorStageError';

    constructor(
        readonly failureStage: AiDeepResearchFailureStage,
        cause: unknown,
    ) {
        super(getErrorMessage(cause), { cause });
    }
}

export type AiDeepResearchExecutorResult =
    | {
          status: 'completed';
          report: AiDeepResearchSubmittedReport;
          warehouseQueryUuids: string[];
          terminalReason: null;
      }
    | {
          status: 'partially_completed';
          report: AiDeepResearchSubmittedReport;
          warehouseQueryUuids: string[];
          terminalReason: AiDeepResearchTerminalReason;
          failureStage: AiDeepResearchFailureStage;
      }
    | {
          status: 'failed';
          errorMessage: string;
          terminalReason: AiDeepResearchTerminalReason;
          failureStage: AiDeepResearchFailureStage;
      }
    | {
          status: 'cancelled';
          terminalReason: AiDeepResearchTerminalReason;
          failureStage: AiDeepResearchFailureStage;
      };

export type AiDeepResearchExecutor = (
    run: DbAiDeepResearchRun,
    context: { signal: AbortSignal },
) => Promise<AiDeepResearchExecutorResult>;

type Dependencies = {
    analytics: LightdashAnalytics;
    aiDeepResearchRunModel: AiDeepResearchRunModel;
    aiAgentModel: Pick<
        AiAgentModel,
        | 'findThreadOwnership'
        | 'findWebAppPrompt'
        | 'getToolCallsAndResultsForPrompt'
    >;
    aiAgentService: Pick<
        AiAgentService,
        | 'assertDeepResearchAccess'
        | 'getIsCopilotEnabled'
        | 'resolveDeepResearchExecutionContext'
    >;
    aiOrganizationSettingsModel: Pick<
        AiOrganizationSettingsModel,
        'findByOrganizationUuid'
    >;
    projectModel: ProjectModel;
    schedulerClient: CommercialSchedulerClient;
    asyncQueryService: AsyncQueryService;
    queryHistoryModel: Pick<QueryHistoryModel, 'getByQueryUuid'>;
    executor?: AiDeepResearchExecutor;
};

type EventCursorPayload = {
    createdAt: string;
    eventUuid: string;
};

const AI_DEEP_RESEARCH_MAX_RESULT_ROWS = 10_000;

const getPositiveInteger = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0
        ? value
        : fallback;

/**
 * budget_snapshot is frozen per run, so rows written before a limit change keep
 * the old shape. Reading it as the current type would leave new limits
 * undefined — and an undefined deadline means setTimeout fires at once, killing
 * the run on its first tick. Every field is resolved against a default instead.
 */
export const getAiDeepResearchRunBudget = (
    budgetSnapshot: DbAiDeepResearchRun['budget_snapshot'],
): AiDeepResearchBudget => {
    const snapshot = (budgetSnapshot ?? {}) as Record<string, unknown>;
    return {
        maxTokens: getPositiveInteger(
            snapshot.maxTokens,
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.maxTokens,
        ),
        maxSteps: getPositiveInteger(
            snapshot.maxSteps,
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.maxSteps,
        ),
        maxToolCalls: getPositiveInteger(
            snapshot.maxToolCalls,
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.maxToolCalls,
        ),
        maxWarehouseQueries: getPositiveInteger(
            snapshot.maxWarehouseQueries,
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.maxWarehouseQueries,
        ),
        deadlineMs: getPositiveInteger(
            snapshot.deadlineMs,
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.deadlineMs,
        ),
        maxResultRows: getPositiveInteger(
            snapshot.maxResultRows,
            AI_DEEP_RESEARCH_MAX_RESULT_ROWS,
        ),
    };
};

const getReportExpiresAt = (row: DbAiDeepResearchRun): Date | null => {
    if (row.report_expires_at) {
        return row.report_expires_at;
    }
    if (row.completed_at && row.result_markdown !== null) {
        return new Date(row.completed_at.getTime() + 30 * 24 * 60 * 60 * 1_000);
    }
    return null;
};

const toRun = (row: DbAiDeepResearchRun): AiDeepResearchRun => {
    const reportExpiresAt = getReportExpiresAt(row);
    const isReportExpired =
        row.report_expired_at !== null ||
        (reportExpiresAt !== null && reportExpiresAt.getTime() <= Date.now());
    return {
        aiDeepResearchRunUuid: row.ai_deep_research_run_uuid,
        projectUuid: row.project_uuid,
        agentUuid: row.agent_uuid,
        aiThreadUuid: row.ai_thread_uuid,
        promptUuid: row.prompt_uuid,
        resumedFromRunUuid: row.resume_from_run_uuid,
        entryPoint: row.entry_point,
        prompt: row.prompt,
        status: row.status,
        terminalReason: row.terminal_reason,
        resultMarkdown:
            isReportExpired ||
            (row.status !== 'completed' && row.status !== 'partially_completed')
                ? null
                : row.result_markdown,
        reportExpiresAt: reportExpiresAt?.toISOString() ?? null,
        reportExpiredAt: row.report_expired_at?.toISOString() ?? null,
        isReportExpired,
        budget: getAiDeepResearchRunBudget(row.budget_snapshot),
        executionContextSnapshot: row.execution_context_snapshot,
        metrics: {
            durationMs: row.duration_ms,
            inputTokens: row.input_tokens,
            outputTokens: row.output_tokens,
            cacheReadTokens: row.cache_read_tokens,
            cacheWriteTokens: row.cache_write_tokens,
            reasoningTokens: row.reasoning_tokens,
            totalTokens: row.total_tokens,
            tokenUsageComplete: row.token_usage_complete,
            toolCallCount: row.tool_call_count,
            toolErrorCount: row.tool_error_count,
            warehouseQueryCount: row.warehouse_query_count,
            findingsCount: row.findings_count,
            chartCount: row.chart_count,
        },
        errorMessage: row.error_message,
        cancellationRequestedAt:
            row.cancellation_requested_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        startedAt: row.started_at?.toISOString() ?? null,
        completedAt: row.completed_at?.toISOString() ?? null,
    };
};

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
        case 'report_adjusted':
            return {
                ...event,
                eventType: row.event_type,
                payload:
                    row.payload as AiDeepResearchEventPayloadMap['report_adjusted'],
            };
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
    // The coordinator has to be able to delegate and still do its own work.
    if (budget.maxToolCalls <= AI_DEEP_RESEARCH_MAX_WORKERS) {
        throw new ParameterError(
            `Deep Research maxToolCalls must exceed ${AI_DEEP_RESEARCH_MAX_WORKERS}`,
        );
    }
};

export class AiDeepResearchService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly aiDeepResearchRunModel: AiDeepResearchRunModel;

    private readonly aiAgentModel: Dependencies['aiAgentModel'];

    private readonly aiAgentService: Pick<
        AiAgentService,
        | 'assertDeepResearchAccess'
        | 'getIsCopilotEnabled'
        | 'resolveDeepResearchExecutionContext'
    >;

    private readonly aiOrganizationSettingsModel: Dependencies['aiOrganizationSettingsModel'];

    private readonly projectModel: ProjectModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly queryHistoryModel: Pick<
        QueryHistoryModel,
        'getByQueryUuid'
    >;

    private readonly executor: AiDeepResearchExecutor | undefined;

    constructor({
        analytics,
        aiDeepResearchRunModel,
        aiAgentModel,
        aiAgentService,
        aiOrganizationSettingsModel,
        projectModel,
        schedulerClient,
        asyncQueryService,
        queryHistoryModel,
        executor,
    }: Dependencies) {
        super();
        this.analytics = analytics;
        this.aiDeepResearchRunModel = aiDeepResearchRunModel;
        this.aiAgentModel = aiAgentModel;
        this.aiAgentService = aiAgentService;
        this.aiOrganizationSettingsModel = aiOrganizationSettingsModel;
        this.projectModel = projectModel;
        this.schedulerClient = schedulerClient;
        this.asyncQueryService = asyncQueryService;
        this.queryHistoryModel = queryHistoryModel;
        this.executor = executor;
    }

    private getAnalyticsDimensions(run: DbAiDeepResearchRun) {
        return {
            organizationId: run.organization_uuid,
            projectId: run.project_uuid,
            runUuid: run.ai_deep_research_run_uuid,
            threadId: run.ai_thread_uuid,
            aiAgentId: run.agent_uuid,
            entryPoint: run.entry_point,
            provider: run.execution_context_snapshot.model.provider,
            model: run.execution_context_snapshot.model.modelName,
            keyManagement: run.execution_context_snapshot.model.keyManagement,
            attachedMcpServerCount:
                run.execution_context_snapshot.tools.attachedMcpServers.length,
        };
    }

    private trackRunStarted(
        run: DbAiDeepResearchRun,
        event: DbAiDeepResearchAnalyticsOutbox,
    ): void {
        this.analytics.track({
            messageId: event.ai_deep_research_analytics_event_uuid,
            event: 'ai_deep_research.run_started',
            userId: run.created_by_user_uuid,
            properties: this.getAnalyticsDimensions(run),
        });
    }

    private async trackRunCompleted(args: {
        run: DbAiDeepResearchRun;
        event: DbAiDeepResearchAnalyticsOutbox;
    }): Promise<boolean> {
        if (!isAiDeepResearchRunTerminal(args.run.status)) {
            return false;
        }
        const reportQuality = getReportQuality(args.run);
        this.analytics.track({
            messageId: args.event.ai_deep_research_analytics_event_uuid,
            event: 'ai_deep_research.run_completed',
            userId: args.run.created_by_user_uuid,
            properties: {
                ...this.getAnalyticsDimensions(args.run),
                status: args.run.status,
                completionClass: getCompletionClass(
                    args.run.status,
                    args.run.result_markdown !== null,
                ),
                terminalReason: args.event.terminal_reason,
                failureStage: args.run.failure_stage,
                durationMs: args.run.duration_ms,
                inputTokens: args.run.input_tokens,
                outputTokens: args.run.output_tokens,
                cacheReadTokens: args.run.cache_read_tokens,
                cacheWriteTokens: args.run.cache_write_tokens,
                reasoningTokens: args.run.reasoning_tokens,
                totalTokens: args.run.total_tokens,
                tokenUsageComplete: args.run.token_usage_complete,
                toolCallCount: args.run.tool_call_count,
                toolErrorCount: args.run.tool_error_count,
                warehouseQueryCount: args.run.warehouse_query_count,
                findingsCount: args.run.findings_count,
                hasReport: args.run.result_markdown !== null,
                reportOutcome:
                    args.run.result_markdown !== null ? 'report' : 'empty',
                chartCount: args.run.chart_count,
                reportStructureValid: reportQuality.structureValid,
                reportEvidenceGrounded: reportQuality.evidenceGrounded,
                reportReproducible: reportQuality.reproducible,
                reportQualityClass: reportQuality.qualityClass,
                failureCategory: getFailureCategory(args.event.terminal_reason),
                warehouseLimitPreventedCount:
                    args.run.warehouse_limit_prevented_count,
                warehouseLimitRetryCount: args.run.warehouse_limit_retry_count,
                warehouseLimitRecoveredCount:
                    args.run.warehouse_limit_recovered_count,
                warehouseLimitUnrecoveredCount:
                    args.run.warehouse_limit_unrecovered_count,
            },
        });
        return true;
    }

    private async dispatchPendingLifecycleAnalytics(
        aiDeepResearchRunUuid?: string,
    ): Promise<void> {
        const events =
            await this.aiDeepResearchRunModel.listPendingAnalyticsEvents({
                aiDeepResearchRunUuid,
            });
        await Promise.all(
            events.map(async (event) => {
                try {
                    const run = await this.aiDeepResearchRunModel.findByUuid(
                        event.ai_deep_research_run_uuid,
                    );
                    if (!run) {
                        return;
                    }
                    let delivered = true;
                    if (event.event_type === 'run_started') {
                        this.trackRunStarted(run, event);
                    } else {
                        delivered = await this.trackRunCompleted({
                            run,
                            event,
                        });
                    }
                    if (delivered) {
                        await this.aiDeepResearchRunModel.markAnalyticsEventDelivered(
                            event.ai_deep_research_analytics_event_uuid,
                        );
                    }
                } catch (error) {
                    this.logger.warn(
                        `Could not deliver ${event.event_type} analytics for Deep Research run ${event.ai_deep_research_run_uuid}: ${getErrorMessage(error)}`,
                    );
                }
            }),
        );
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

    private async assertCurrentRunAccess(
        user: SessionUser,
        run: DbAiDeepResearchRun,
    ): Promise<void> {
        await this.aiAgentService.assertDeepResearchAccess(user, {
            agentUuid: run.agent_uuid,
            organizationUuid: run.organization_uuid,
            projectUuid: run.project_uuid,
            threadUuid: run.ai_thread_uuid,
        });
    }

    private async findCreatorOwnedRun(
        user: SessionUser,
        projectUuid: string,
        aiDeepResearchRunUuid: string,
        requireCurrentAgentAccess = true,
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

        if (requireCurrentAgentAccess) {
            await this.assertCurrentRunAccess(user, run);
        }
        return run;
    }

    private async enqueueRun(run: DbAiDeepResearchRun): Promise<void> {
        await this.schedulerClient.aiDeepResearch({
            aiDeepResearchRunUuid: run.ai_deep_research_run_uuid,
            organizationUuid: run.organization_uuid,
            projectUuid: run.project_uuid,
            userUuid: run.created_by_user_uuid,
        });
        await this.aiDeepResearchRunModel.recordRunAccepted(
            run.ai_deep_research_run_uuid,
        );
    }

    async createRun(args: {
        user: SessionUser;
        projectUuid: string;
        prompt: string;
        agentUuid: string;
        aiThreadUuid: string;
        promptUuid: string;
        entryPoint: AiDeepResearchEntryPoint;
        resumeFromRunUuid?: string;
        toolCallId?: string;
    }): Promise<AiDeepResearchRun> {
        if (!isUserWithOrg(args.user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (args.user.impersonation) {
            throw new ForbiddenError(
                'Deep Research must be started by a signed-in user',
            );
        }
        if (args.prompt.trim().length === 0) {
            throw new ParameterError('Deep Research prompt is required');
        }
        await this.assertCanCreateRun(args.user, args.projectUuid);
        if (!(await this.aiAgentService.getIsCopilotEnabled(args.user))) {
            throw new ForbiddenError('AI Copilot is not enabled');
        }
        const organizationSettings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                args.user.organizationUuid,
            );
        const budget: AiDeepResearchBudget = {
            ...(organizationSettings?.deepResearchLimits ??
                AI_DEEP_RESEARCH_DEFAULT_LIMITS),
            maxResultRows: AI_DEEP_RESEARCH_MAX_RESULT_ROWS,
        };
        assertValidBudget(budget);

        const ownership = await this.aiAgentModel.findThreadOwnership({
            organizationUuid: args.user.organizationUuid,
            threadUuid: args.aiThreadUuid,
        });
        if (
            !ownership ||
            ownership.projectUuid !== args.projectUuid ||
            ownership.agentUuid !== args.agentUuid ||
            ownership.ownerUserUuid !== args.user.userUuid
        ) {
            throw new NotFoundError(`AI thread ${args.aiThreadUuid} not found`);
        }
        const prompt = await this.aiAgentModel.findWebAppPrompt(
            args.promptUuid,
        );
        if (
            !prompt ||
            prompt.threadUuid !== args.aiThreadUuid ||
            prompt.agentUuid !== args.agentUuid ||
            prompt.projectUuid !== args.projectUuid ||
            prompt.createdByUserUuid !== args.user.userUuid
        ) {
            throw new NotFoundError(`AI prompt ${args.promptUuid} not found`);
        }
        if (prompt.prompt.trim() !== args.prompt.trim()) {
            throw new ParameterError(
                'Deep Research prompt does not match the selected thread message',
            );
        }

        let resumeFromRunUuid: string | null = null;
        if (args.resumeFromRunUuid) {
            const sourceRun = await this.findCreatorOwnedRun(
                args.user,
                args.projectUuid,
                args.resumeFromRunUuid,
            );
            if (
                sourceRun.ai_thread_uuid !== args.aiThreadUuid ||
                !isAiDeepResearchRunTerminal(sourceRun.status) ||
                sourceRun.status === 'completed' ||
                sourceRun.status === 'cancelled'
            ) {
                throw new ParameterError(
                    'Deep Research can only resume an unfinished terminal run',
                );
            }
            const sourceEvidence = await this.buildEvidencePack(sourceRun);
            if (
                isAiDeepResearchEvidencePackEmpty(sourceEvidence.evidencePack)
            ) {
                throw new ParameterError(
                    'This Deep Research run has no preserved evidence to resume',
                );
            }
            resumeFromRunUuid = sourceRun.ai_deep_research_run_uuid;
        }

        const existingRun =
            await this.aiDeepResearchRunModel.findByPromptScoped({
                promptUuid: args.promptUuid,
                organizationUuid: args.user.organizationUuid,
                projectUuid: args.projectUuid,
                createdByUserUuid: args.user.userUuid,
            });
        if (existingRun) {
            await this.assertCurrentRunAccess(args.user, existingRun);
            if (existingRun.status === 'queued') {
                await this.enqueueRun(existingRun);
            }
            await this.dispatchPendingLifecycleAnalytics(
                existingRun.ai_deep_research_run_uuid,
            );
            return toRun(existingRun);
        }

        const existingToolCalls =
            await this.aiAgentModel.getToolCallsAndResultsForPrompt(
                args.promptUuid,
            );
        if (
            prompt.response !== null ||
            prompt.errorMessage !== null ||
            existingToolCalls.length > 0
        ) {
            throw new ParameterError(
                'Deep Research requires a new thread message that has not been answered',
            );
        }

        const executionContextSnapshot: AiDeepResearchExecutionContextSnapshot =
            await this.aiAgentService.resolveDeepResearchExecutionContext(
                args.user,
                {
                    projectUuid: args.projectUuid,
                    agentUuid: args.agentUuid,
                    modelConfig: prompt.modelConfig ?? null,
                    rawSqlEnabled:
                        organizationSettings?.deepResearchRawSqlEnabled ??
                        false,
                },
            );

        let run: DbAiDeepResearchRun;
        try {
            run = await this.aiDeepResearchRunModel.create({
                organizationUuid: args.user.organizationUuid,
                projectUuid: args.projectUuid,
                createdByUserUuid: args.user.userUuid,
                agentUuid: args.agentUuid,
                aiThreadUuid: args.aiThreadUuid,
                promptUuid: args.promptUuid,
                toolCallId: args.toolCallId ?? null,
                prompt: prompt.prompt.trim(),
                entryPoint: args.entryPoint,
                ...(resumeFromRunUuid ? { resumeFromRunUuid } : {}),
                budget,
                executionContextSnapshot,
            });
        } catch (error) {
            const concurrentRun =
                await this.aiDeepResearchRunModel.findByPromptScoped({
                    promptUuid: args.promptUuid,
                    organizationUuid: args.user.organizationUuid,
                    projectUuid: args.projectUuid,
                    createdByUserUuid: args.user.userUuid,
                });
            if (concurrentRun) {
                await this.assertCurrentRunAccess(args.user, concurrentRun);
                if (concurrentRun.status === 'queued') {
                    await this.enqueueRun(concurrentRun);
                }
                await this.dispatchPendingLifecycleAnalytics(
                    concurrentRun.ai_deep_research_run_uuid,
                );
                return toRun(concurrentRun);
            }
            if (error instanceof AiDeepResearchActiveRunError) {
                throw new ConflictError(
                    'Only one Deep Research run can be active in a thread at a time',
                    { activeRunUuid: error.activeRunUuid },
                );
            }
            if (error instanceof AiDeepResearchPromptExecutionModeError) {
                throw new ConflictError(error.message);
            }
            throw error;
        }

        try {
            await this.enqueueRun(run);
        } catch (error) {
            this.logger.error(
                `Failed to enqueue Deep Research run ${run.ai_deep_research_run_uuid}: ${getErrorMessage(error)}`,
            );
            await this.aiDeepResearchRunModel.markFailed(
                run.ai_deep_research_run_uuid,
                FAILED_RUN_ERROR_MESSAGE,
                'internal_error',
                'enqueue',
            );
            await this.aiDeepResearchRunModel.deleteUnstartedFailedRun(
                run.ai_deep_research_run_uuid,
            );
            throw error;
        }

        await this.dispatchPendingLifecycleAnalytics(
            run.ai_deep_research_run_uuid,
        );
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

    async listRunsForThread(
        user: SessionUser,
        projectUuid: string,
        aiThreadUuid: string,
    ): Promise<AiDeepResearchRun[]> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const ownership = await this.aiAgentModel.findThreadOwnership({
            organizationUuid: user.organizationUuid,
            threadUuid: aiThreadUuid,
        });
        if (
            !ownership ||
            !ownership.agentUuid ||
            ownership.projectUuid !== projectUuid ||
            ownership.ownerUserUuid !== user.userUuid
        ) {
            throw new NotFoundError(`AI thread ${aiThreadUuid} not found`);
        }
        await this.aiAgentService.assertDeepResearchAccess(user, {
            agentUuid: ownership.agentUuid,
            organizationUuid: user.organizationUuid,
            projectUuid,
            threadUuid: aiThreadUuid,
        });

        const runs = await this.aiDeepResearchRunModel.findByThreadScoped({
            aiThreadUuid,
            organizationUuid: user.organizationUuid,
            projectUuid,
            createdByUserUuid: user.userUuid,
        });
        return runs.map(toRun);
    }

    async cleanExpiredReports(batchSize: number) {
        return this.aiDeepResearchRunModel.cleanExpiredReports(batchSize);
    }

    async refreshChart(args: {
        account: Account;
        user: SessionUser;
        projectUuid: string;
        aiDeepResearchRunUuid: string;
        chartKey: string;
    }): Promise<ApiAiAgentThreadMessageVizQuery> {
        const run = await this.findCreatorOwnedRun(
            args.user,
            args.projectUuid,
            args.aiDeepResearchRunUuid,
        );
        const chart = await this.getRunChart(run, args.chartKey);

        const query = await this.asyncQueryService.executeAsyncMetricQuery({
            account: args.account,
            projectUuid: args.projectUuid,
            metricQuery: chart.metricQuery,
            context: QueryExecutionContext.AI,
            pivotConfiguration: this.getChartPivotConfiguration(chart),
        });

        return {
            source: 'semantic',
            type: AiResultType.QUERY_RESULT,
            mergeQuery: null,
            query: {
                queryUuid: query.queryUuid,
                cacheMetadata: query.cacheMetadata,
                metricQuery: query.metricQuery,
                fields: query.fields,
                warnings: query.warnings,
                parameterReferences: [],
                usedParametersValues: {},
                resolvedTimezone: query.metricQuery.timezone ?? null,
            },
            metadata: {
                title: chart.title,
                description: null,
            },
        };
    }

    // Grouped charts expect server-pivoted results, matching the chat viz path.
    private getChartPivotConfiguration(
        chart: AiDeepResearchChartData,
    ): PivotConfiguration | undefined {
        try {
            const webAiChartConfig = getWebAiChartConfig({
                vizConfig: buildDeepResearchVizConfig(chart),
                metricQuery: chart.metricQuery,
                fieldsMap: chart.fields,
                overrideChartType: chart.chartConfig.defaultVizType,
            });
            const groupByDimensions = getGroupByDimensions(webAiChartConfig);
            if (!groupByDimensions?.length) {
                return undefined;
            }
            return derivePivotConfigurationFromChart(
                {
                    chartConfig: webAiChartConfig.echartsConfig,
                    pivotConfig: { columns: groupByDimensions },
                },
                chart.metricQuery,
                chart.fields,
            );
        } catch (error) {
            this.logger.warn(
                `Deep Research chart ${chart.queryUuid} refresh falls back to unpivoted results: ${getErrorMessage(error)}`,
            );
            return undefined;
        }
    }

    async getChart(args: {
        user: SessionUser;
        projectUuid: string;
        aiDeepResearchRunUuid: string;
        queryUuid: string;
    }): Promise<AiDeepResearchChartData> {
        const run = await this.findCreatorOwnedRun(
            args.user,
            args.projectUuid,
            args.aiDeepResearchRunUuid,
        );
        return this.getRunChart(run, args.queryUuid);
    }

    private async getRunChart(
        run: DbAiDeepResearchRun,
        queryUuid: string,
    ): Promise<AiDeepResearchChartData> {
        const reportExpiresAt = getReportExpiresAt(run);
        const isExpired =
            run.report_expired_at !== null ||
            (reportExpiresAt && reportExpiresAt.getTime() <= Date.now());
        const isReferenced = findDeepResearchChartRefs(
            run.result_markdown ?? '',
        ).some(({ key }) => key === queryUuid);
        if (isExpired || !isReferenced) {
            throw new NotFoundError(
                `Deep Research chart ${queryUuid} not found`,
            );
        }

        const chart = await this.findRunWarehouseChart(run, queryUuid);
        const chartData = chart
            ? await this.buildWarehouseChartData(
                  run,
                  chart,
                  new Set([queryUuid]),
              )
            : null;
        if (!chartData) {
            throw new NotFoundError(
                `Deep Research chart ${queryUuid} not found`,
            );
        }
        return chartData;
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
            false,
        );
        const run = await this.aiDeepResearchRunModel.requestCancellation(
            aiDeepResearchRunUuid,
        );
        if (!run) {
            throw new NotFoundError(
                `Deep Research run ${aiDeepResearchRunUuid} not found`,
            );
        }
        await this.dispatchPendingLifecycleAnalytics(aiDeepResearchRunUuid);
        return {
            ...toRun({
                ...run,
                result_markdown: null,
            }),
            executionContextSnapshot: null,
        };
    }

    async executeRun(
        payload: AiDeepResearchJobPayload,
        signal: AbortSignal = new AbortController().signal,
    ): Promise<void> {
        await this.aiDeepResearchRunModel.recordRunAccepted(
            payload.aiDeepResearchRunUuid,
        );
        const run = await this.aiDeepResearchRunModel.claimQueuedRun(
            payload.aiDeepResearchRunUuid,
        );
        if (!run) {
            await this.dispatchPendingLifecycleAnalytics(
                payload.aiDeepResearchRunUuid,
            );
            this.logger.info(
                `Deep Research run ${payload.aiDeepResearchRunUuid} was already claimed or is terminal`,
            );
            return;
        }
        await this.dispatchPendingLifecycleAnalytics(
            payload.aiDeepResearchRunUuid,
        );

        if (!this.executor) {
            await this.aiDeepResearchRunModel.markFailed(
                payload.aiDeepResearchRunUuid,
                'Deep Research executor is not configured',
                'internal_error',
                'enqueue',
            );
            await this.dispatchPendingLifecycleAnalytics(
                payload.aiDeepResearchRunUuid,
            );
            throw new Error('Deep Research executor is not configured');
        }

        let checkpointedReport: AiDeepResearchSubmittedReport | null = null;
        let currentStage: AiDeepResearchFailureStage = 'investigation';
        try {
            const result = await this.executor(run, { signal });
            currentStage = 'persistence';
            if (result.status === 'completed') {
                const report = await this.persistAndPrepareEvidenceReport(
                    run,
                    result.report,
                    new Set(result.warehouseQueryUuids),
                );
                checkpointedReport = result.report;
                const hasAdjustments =
                    report.adjustments.repaired.length > 0 ||
                    report.adjustments.dropped.length > 0;
                const completed = await retryReportFinalization(
                    () =>
                        hasAdjustments
                            ? this.aiDeepResearchRunModel.markCompleted(
                                  payload.aiDeepResearchRunUuid,
                                  report.markdown,
                                  report.adjustments,
                              )
                            : this.aiDeepResearchRunModel.markCompleted(
                                  payload.aiDeepResearchRunUuid,
                                  report.markdown,
                              ),
                    (error, attempt) => {
                        this.logger.warn(
                            `Deep Research run ${run.ai_deep_research_run_uuid} could not persist completion (retry ${attempt}): ${getErrorMessage(error)}`,
                        );
                    },
                );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                } else {
                    await this.dispatchPendingLifecycleAnalytics(
                        payload.aiDeepResearchRunUuid,
                    );
                }
                return;
            }
            if (result.status === 'partially_completed') {
                const report = await this.persistAndPrepareEvidenceReport(
                    run,
                    result.report,
                    new Set(result.warehouseQueryUuids),
                );
                checkpointedReport = result.report;
                const hasAdjustments =
                    report.adjustments.repaired.length > 0 ||
                    report.adjustments.dropped.length > 0;
                const completed = await retryReportFinalization(
                    () =>
                        hasAdjustments
                            ? this.aiDeepResearchRunModel.markPartiallyCompleted(
                                  payload.aiDeepResearchRunUuid,
                                  report.markdown,
                                  result.terminalReason,
                                  result.failureStage,
                                  report.adjustments,
                              )
                            : this.aiDeepResearchRunModel.markPartiallyCompleted(
                                  payload.aiDeepResearchRunUuid,
                                  report.markdown,
                                  result.terminalReason,
                                  result.failureStage,
                              ),
                    (error, attempt) => {
                        this.logger.warn(
                            `Deep Research run ${run.ai_deep_research_run_uuid} could not persist partial completion (retry ${attempt}): ${getErrorMessage(error)}`,
                        );
                    },
                );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                } else {
                    await this.dispatchPendingLifecycleAnalytics(
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
                    result.terminalReason === 'no_relevant_data'
                        ? AI_DEEP_RESEARCH_NO_RELEVANT_DATA_ERROR_MESSAGE
                        : FAILED_RUN_ERROR_MESSAGE,
                    result.terminalReason,
                    result.failureStage,
                );
                await this.dispatchPendingLifecycleAnalytics(
                    payload.aiDeepResearchRunUuid,
                );
                return;
            }

            const cancelled = await this.aiDeepResearchRunModel.markCancelled(
                payload.aiDeepResearchRunUuid,
                result.failureStage,
                result.terminalReason,
            );
            if (cancelled) {
                await this.dispatchPendingLifecycleAnalytics(
                    payload.aiDeepResearchRunUuid,
                );
            } else {
                await this.aiDeepResearchRunModel.markFailed(
                    payload.aiDeepResearchRunUuid,
                    'Deep Research stopped without a cancellation request',
                    'internal_error',
                    result.failureStage,
                );
                await this.dispatchPendingLifecycleAnalytics(
                    payload.aiDeepResearchRunUuid,
                );
            }
        } catch (error) {
            this.logger.error(
                `Deep Research run ${payload.aiDeepResearchRunUuid} threw: ${getErrorMessage(error)}`,
            );
            if (!checkpointedReport) {
                await this.aiDeepResearchRunModel.markFailed(
                    payload.aiDeepResearchRunUuid,
                    FAILED_RUN_ERROR_MESSAGE,
                    'internal_error',
                    error instanceof AiDeepResearchExecutorStageError
                        ? error.failureStage
                        : currentStage,
                );
            }
            await this.dispatchPendingLifecycleAnalytics(
                payload.aiDeepResearchRunUuid,
            );
            throw error;
        }
    }

    private async persistAndPrepareEvidenceReport(
        run: DbAiDeepResearchRun,
        report: AiDeepResearchSubmittedReport,
        runQueryUuids: Set<string>,
    ): Promise<{
        markdown: string;
        adjustments: AiDeepResearchReportAdjustment;
    }> {
        await retryReportFinalization(
            async () => {
                await this.aiDeepResearchRunModel.checkpointReport(
                    run.ai_deep_research_run_uuid,
                    report.markdown,
                );
            },
            (error, attempt) => {
                this.logger.warn(
                    `Deep Research run ${run.ai_deep_research_run_uuid} could not checkpoint its report (retry ${attempt}): ${getErrorMessage(error)}`,
                );
            },
        );

        try {
            return await retryReportFinalization(
                () => this.prepareEvidenceReport(run, report, runQueryUuids),
                (error, attempt) => {
                    this.logger.warn(
                        `Deep Research run ${run.ai_deep_research_run_uuid} could not verify its report evidence (retry ${attempt}): ${getErrorMessage(error)}`,
                    );
                },
            );
        } catch (error) {
            this.logger.error(
                `Deep Research run ${run.ai_deep_research_run_uuid} is publishing its checkpointed report after evidence verification failed: ${getErrorMessage(error)}`,
            );
            return {
                markdown: report.markdown,
                adjustments: { repaired: [], dropped: [] },
            };
        }
    }

    /**
     * The model only names the executions it wants charted; the chart itself is
     * derived here from the execution the server already holds. A reference the
     * server cannot back is spliced out of the markdown, never allowed to
     * discard the report: the narrative is the deliverable.
     */
    private async prepareEvidenceReport(
        run: DbAiDeepResearchRun,
        report: AiDeepResearchSubmittedReport,
        runQueryUuids: Set<string>,
    ): Promise<{
        markdown: string;
        adjustments: AiDeepResearchReportAdjustment;
    }> {
        const currentCharts = await this.getRunWarehouseCharts(run);
        const sourceRun = run.resume_from_run_uuid
            ? await this.aiDeepResearchRunModel.findByUuid(
                  run.resume_from_run_uuid,
              )
            : null;
        const sourceCharts = sourceRun
            ? await this.getRunWarehouseCharts(sourceRun)
            : new Map();
        const derivable = new Map([
            ...sourceCharts.entries(),
            ...currentCharts.entries(),
        ]);
        const sourceEvidence = sourceRun
            ? await this.buildEvidencePack(sourceRun, 1)
            : null;
        const trustedQueryUuids = new Set([
            ...runQueryUuids,
            ...(sourceEvidence?.evidencePack.queries.map(
                (query) => query.queryUuid,
            ) ?? []),
        ]);
        const requestedKeys = [
            ...new Set(
                findDeepResearchChartRefs(report.markdown).map(
                    ({ key }) => key,
                ),
            ),
        ].slice(0, AI_DEEP_RESEARCH_MAX_CHARTS);

        const verified = await Promise.all(
            requestedKeys.map(async (key) => {
                const candidate = derivable.get(key);
                if (!candidate) {
                    return null;
                }
                try {
                    const ownerRun = sourceCharts.has(key) ? sourceRun : run;
                    const entry = await this.buildWarehouseChartData(
                        ownerRun ?? run,
                        candidate.chart,
                        trustedQueryUuids,
                    );
                    return entry
                        ? ([
                              key,
                              {
                                  title: entry.title,
                                  description: candidate.description,
                              },
                          ] as const)
                        : null;
                } catch (error) {
                    this.logger.error(
                        `Deep Research run ${run.ai_deep_research_run_uuid} could not prepare chart ${key}: ${getErrorMessage(error)}`,
                    );
                    return null;
                }
            }),
        );

        const published = new Map(
            verified.flatMap((entry) => (entry ? [entry] : [])),
        );
        const omittedKeys = requestedKeys.filter((key) => !published.has(key));
        if (omittedKeys.length > 0) {
            this.logger.warn(
                `Deep Research run ${run.ai_deep_research_run_uuid} published without unbackable chart(s): ${omittedKeys.join(
                    ', ',
                )}`,
            );
        }
        const chartReport = applyDeepResearchChartRefsWithAdjustments(
            report.markdown,
            published,
            {
                knownKeys: new Set(derivable.keys()),
                unverifiableKeys: new Set(omittedKeys),
            },
        );
        const hasDroppedCharts = chartReport.adjustments.dropped.length > 0;
        return {
            markdown: hasDroppedCharts
                ? addReportAdjustedWarning(chartReport.markdown)
                : chartReport.markdown,
            adjustments: chartReport.adjustments,
        };
    }

    /**
     * Every chart this run could publish, keyed by the execution behind it. A
     * worker's calls are children tagged with this run; the coordinator's are
     * top-level. Anything tagged for another run is refused even when it shares
     * this prompt.
     */
    private async getRunWarehouseCharts(
        run: DbAiDeepResearchRun,
    ): Promise<
        Map<
            string,
            { chart: AiDeepResearchWarehouseChart; description: string }
        >
    > {
        const provenance =
            await this.aiAgentModel.getToolCallsAndResultsForPrompt(
                run.prompt_uuid,
                { includeSubagentToolCalls: true },
            );

        return new Map(
            provenance.flatMap(({ toolCall, toolResult }) => {
                const queryUuid = toolResult
                    ? getQueryUuidFromMetadata(toolResult.metadata)
                    : null;
                if (
                    toolCall.toolName !== 'generateVisualization' ||
                    queryUuid === null ||
                    (toolCall.parentToolCallId !== null &&
                        !toolCall.parentToolCallId.startsWith(
                            `deep-research:${run.ai_deep_research_run_uuid}:`,
                        ))
                ) {
                    return [];
                }
                const resolved = resolveDeepResearchWarehouseChart(
                    toolCall.toolArgs,
                    queryUuid,
                );
                return resolved ? [[queryUuid, resolved] as const] : [];
            }),
        );
    }

    private async findRunWarehouseChart(
        run: DbAiDeepResearchRun,
        queryUuid: string,
    ): Promise<AiDeepResearchWarehouseChart | null> {
        const charts = await this.getRunWarehouseCharts(run);
        return charts.get(queryUuid)?.chart ?? null;
    }

    /**
     * Rebuilds what the run established from its own verified executions, so
     * the finalizer never has to replay the research conversation. Bounded by
     * the number of queries, not by how long the transcript grew.
     */
    async buildEvidencePack(
        run: DbAiDeepResearchRun,
        depth = 0,
    ): Promise<AiDeepResearchEvidenceBuildResult> {
        const timezone =
            (await this.projectModel.getQueryTimezone(run.project_uuid)) ??
            'UTC';
        const provenance =
            await this.aiAgentModel.getToolCallsAndResultsForPrompt(
                run.prompt_uuid,
                { includeSubagentToolCalls: true },
            );

        const belongsToRun = (parentToolCallId: string | null) =>
            parentToolCallId === null ||
            parentToolCallId.startsWith(
                `deep-research:${run.ai_deep_research_run_uuid}:`,
            );
        const runProvenance = provenance.filter(({ toolCall }) =>
            belongsToRun(toolCall.parentToolCallId),
        );
        const hasToolFailures = runProvenance.some(({ toolResult }) =>
            isToolResultFailure(toolResult),
        );
        const workerFindingResults = runProvenance.flatMap(({ toolCall }) =>
            toolCall.toolName === AI_DEEP_RESEARCH_WORKER_FINDINGS_TOOL_NAME &&
            toolCall.parentToolCallId?.startsWith(
                `deep-research:${run.ai_deep_research_run_uuid}:`,
            )
                ? [
                      aiDeepResearchWorkerFindingsInputSchema.safeParse(
                          toolCall.toolArgs,
                      ),
                  ]
                : [],
        );
        const workerFindings = workerFindingResults.flatMap((parsed) =>
            parsed.success ? [parsed.data] : [],
        );

        const evidenceQueryCalls = runProvenance.filter(({ toolCall }) =>
            isDeepResearchEvidenceQueryTool(toolCall.toolName),
        );
        const executions = evidenceQueryCalls.flatMap(
            ({ toolCall, toolResult }) => {
                const queryUuid = toolResult
                    ? getQueryUuidFromMetadata(toolResult.metadata)
                    : null;
                return queryUuid && isValidUuid(queryUuid)
                    ? [
                          {
                              queryUuid,
                              toolName: toolCall.toolName,
                              toolArgs: toolCall.toolArgs,
                          },
                      ]
                    : [];
            },
        );
        // Latest execution of a queryUuid wins; a retried query would
        // otherwise appear twice.
        const uniqueExecutions = [
            ...new Map(
                executions.map((execution) => [execution.queryUuid, execution]),
            ).values(),
        ].slice(-AI_DEEP_RESEARCH_EVIDENCE_MAX_QUERIES);

        const queryResults = await Promise.all(
            uniqueExecutions.map((execution) =>
                this.buildEvidenceQuery(run, execution),
            ),
        );

        const currentPack: AiDeepResearchEvidencePack = {
            question: run.prompt,
            generatedAt: new Date().toISOString(),
            timezone,
            queries: queryResults.flatMap((query) => (query ? [query] : [])),
            workerFindings,
        };
        let evidencePack = currentPack;
        let hasEvidenceBuildFailures =
            hasToolFailures ||
            workerFindingResults.some((parsed) => !parsed.success) ||
            executions.length < evidenceQueryCalls.length ||
            queryResults.some((query) => query === null);
        if (run.resume_from_run_uuid && depth === 0) {
            const sourceRun = await this.aiDeepResearchRunModel.findByUuid(
                run.resume_from_run_uuid,
            );
            if (sourceRun) {
                const source = await this.buildEvidencePack(sourceRun, 1);
                evidencePack = {
                    question: run.prompt,
                    generatedAt: currentPack.generatedAt,
                    timezone: currentPack.timezone,
                    queries: [
                        ...source.evidencePack.queries,
                        ...currentPack.queries,
                    ].slice(-AI_DEEP_RESEARCH_EVIDENCE_MAX_QUERIES),
                    workerFindings: [
                        ...source.evidencePack.workerFindings,
                        ...currentPack.workerFindings,
                    ],
                };
                hasEvidenceBuildFailures ||= source.hasEvidenceBuildFailures;
            }
        }
        return { evidencePack, hasEvidenceBuildFailures };
    }

    private async buildEvidenceQuery(
        run: DbAiDeepResearchRun,
        {
            queryUuid,
            toolName,
            toolArgs,
        }: { queryUuid: string; toolName: string; toolArgs: unknown },
    ): Promise<AiDeepResearchEvidenceQuery | null> {
        try {
            const queryHistory =
                await this.queryHistoryModel.getByQueryUuid(queryUuid);
            if (!queryHistory) {
                return null;
            }
            const executionStartedAt = run.started_at ?? run.created_at;
            const isRawSql = isDeepResearchRawSqlTool(toolName);
            const isExpectedQueryContext = isRawSql
                ? queryHistory.context === QueryExecutionContext.AI ||
                  queryHistory.context === QueryExecutionContext.MCP_RUN_SQL
                : queryHistory.context === QueryExecutionContext.AI ||
                  queryHistory.context ===
                      QueryExecutionContext.MCP_RUN_METRIC_QUERY;
            const isVerified =
                isExpectedQueryContext &&
                queryHistory.projectUuid === run.project_uuid &&
                queryHistory.organizationUuid === run.organization_uuid &&
                queryHistory.createdByUserUuid === run.created_by_user_uuid &&
                queryHistory.createdAt >= executionStartedAt &&
                queryHistory.status === QueryHistoryStatus.READY &&
                queryHistory.resultsFileName !== null;
            if (!isVerified || queryHistory.resultsFileName === null) {
                return null;
            }

            const page = await this.asyncQueryService.getResultsPageFromS3(
                queryUuid,
                queryHistory.resultsFileName,
                queryHistory.context,
                1,
                AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS,
                (row) => row,
            );
            const baseEvidence = {
                queryUuid,
                rowCount: queryHistory.totalRowCount ?? page.rows.length,
                rowsCsv: convertQueryResultsToCsv(
                    { rows: page.rows, fields: queryHistory.fields },
                    AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS,
                ),
                truncated:
                    (queryHistory.totalRowCount ?? page.rows.length) >
                    AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS,
                warnings: [] as string[],
            };
            if (baseEvidence.rowCount <= AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS) {
                baseEvidence.warnings.push(
                    `Small result set (${baseEvidence.rowCount} rows): verify the expected grain before making broad magnitude claims.`,
                );
            }
            if (baseEvidence.truncated) {
                baseEvidence.warnings.push(
                    `Only the first ${AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS} of ${baseEvidence.rowCount} rows are included in this evidence pack.`,
                );
            }
            if (isRawSql) {
                let columns = Object.keys(queryHistory.columns ?? {});
                if (columns.length === 0) {
                    columns = Object.keys(queryHistory.originalColumns ?? {});
                }
                if (columns.length === 0) {
                    columns = Object.keys(page.rows[0] ?? {});
                }
                return {
                    ...baseEvidence,
                    type: 'sql_query',
                    title: 'Raw SQL query',
                    description: '',
                    columns,
                    chartable: false,
                    visualizationType: null,
                };
            }

            // Persisted args may predate the current advertised contract.
            const parsedArgs =
                toolRunQueryArgsSchemaPersisted.safeParse(toolArgs);
            const resolvedChart = resolveDeepResearchWarehouseChart(
                toolArgs,
                queryUuid,
            );
            const { metricQuery } = queryHistory;
            if (Object.keys(metricQuery.filters).length > 0) {
                baseEvidence.warnings.push(
                    'This query is filtered; do not generalize its results outside the filtered population.',
                );
            }
            if (baseEvidence.rowCount >= metricQuery.limit) {
                baseEvidence.warnings.push(
                    `The result reached its ${metricQuery.limit}-row query limit and may not represent the full population.`,
                );
            }
            return {
                ...baseEvidence,
                type: 'metric_query',
                title: parsedArgs.success ? parsedArgs.data.title : queryUuid,
                description: parsedArgs.success
                    ? parsedArgs.data.description
                    : '',
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
                filters: metricQuery.filters,
                sorts: metricQuery.sorts,
                limit: metricQuery.limit,
                timezone: metricQuery.timezone ?? null,
                chartable: resolvedChart !== null,
                visualizationType:
                    resolvedChart?.chart.chartConfig.defaultVizType ?? null,
            };
        } catch (error) {
            // A single unreadable result must not cost the whole pack.
            this.logger.warn(
                `Deep Research run ${run.ai_deep_research_run_uuid} could not read evidence for query ${queryUuid}: ${getErrorMessage(error)}`,
            );
            return null;
        }
    }

    private async buildWarehouseChartData(
        run: DbAiDeepResearchRun,
        chart: AiDeepResearchWarehouseChart,
        runQueryUuids: Set<string>,
    ): Promise<AiDeepResearchChartData | null> {
        // The UUID set is built from this run's persisted warehouse-tool results.
        if (!runQueryUuids.has(chart.queryUuid)) {
            return null;
        }

        const queryHistory = await this.queryHistoryModel.getByQueryUuid(
            chart.queryUuid,
        );
        const executionStartedAt = run.started_at ?? run.created_at;
        const isVerified =
            (queryHistory?.context === QueryExecutionContext.AI ||
                queryHistory?.context ===
                    QueryExecutionContext.MCP_RUN_METRIC_QUERY) &&
            queryHistory.projectUuid === run.project_uuid &&
            queryHistory.organizationUuid === run.organization_uuid &&
            queryHistory.createdByUserUuid === run.created_by_user_uuid &&
            queryHistory.createdAt >= executionStartedAt &&
            (queryHistory.createdByActorType === 'session' ||
                queryHistory.createdByActorType === 'pat') &&
            queryHistory.status === QueryHistoryStatus.READY &&
            isChartConfigCompatible(chart, queryHistory.metricQuery);
        if (!isVerified) {
            return null;
        }

        return {
            source: 'warehouse',
            title: chart.title,
            chartConfig: chart.chartConfig,
            queryUuid: chart.queryUuid,
            metricQuery: queryHistory.metricQuery,
            fields: queryHistory.fields,
        };
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
            const cancelled = await this.aiDeepResearchRunModel.markCancelled(
                aiDeepResearchRunUuid,
                'persistence',
            );
            if (cancelled) {
                await this.dispatchPendingLifecycleAnalytics(
                    aiDeepResearchRunUuid,
                );
            }
        }
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
            AI_DEEP_RESEARCH_STALE_RUN_THRESHOLD_MINUTES,
            STALE_RUN_ERROR_MESSAGE,
        );
        if (runs.length > 0) {
            this.logger.warn(
                `Swept ${runs.length} stale Deep Research run(s) after ${AI_DEEP_RESEARCH_STALE_RUN_THRESHOLD_MINUTES} minutes`,
            );
        }
        await this.dispatchPendingLifecycleAnalytics();
        return runs.length;
    }
}
