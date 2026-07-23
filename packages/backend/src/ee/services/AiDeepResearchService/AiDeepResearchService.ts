import { subject } from '@casl/ability';
import {
    AiResultType,
    buildInlineChartFields,
    buildInlineChartMetricQuery,
    FeatureFlags,
    findDeepResearchChartRefs,
    ForbiddenError,
    getDeepResearchChartKey,
    getErrorMessage,
    isAiDeepResearchRunTerminal,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    spliceDeepResearchRanges,
    UnexpectedServerError,
    type Account,
    type AiDeepResearchBudget,
    type AiDeepResearchChartData,
    type AiDeepResearchChartDataMap,
    type AiDeepResearchChartDefinition,
    type AiDeepResearchChartSnapshot,
    type AiDeepResearchChartSnapshotValue,
    type AiDeepResearchEffort,
    type AiDeepResearchEvent,
    type AiDeepResearchEventPayloadMap,
    type AiDeepResearchEventsPage,
    type AiDeepResearchInlineChart,
    type AiDeepResearchJobPayload,
    type AiDeepResearchProgress,
    type AiDeepResearchRun,
    type AiDeepResearchWarehouseChart,
    type ApiAiAgentThreadMessageVizQuery,
    type SessionUser,
} from '@lightdash/common';
import { createInterface } from 'readline';
import { validate as isValidUuid } from 'uuid';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import { type AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../services/BaseService';
import {
    type DbAiDeepResearchEvent,
    type DbAiDeepResearchRun,
} from '../../database/entities/aiDeepResearch';
import { type AiAgentModel } from '../../models/AiAgentModel';
import {
    type AiDeepResearchRunModel,
    type DbAiDeepResearchEventWithCursor,
} from '../../models/AiDeepResearchRunModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';

const MAX_EVENT_PAGE_SIZE = 100;
const DEFAULT_EVENT_PAGE_SIZE = 50;
const STALE_RUN_THRESHOLD_MINUTES = 75;
const STALE_RUN_ERROR_MESSAGE =
    'Deep Research stopped unexpectedly before it could finish.';
const FAILED_RUN_ERROR_MESSAGE =
    'Deep Research could not finish. Please try again.';
const OMITTED_CHARTS_CAVEAT =
    'Some proposed charts were omitted because their query evidence could not be verified.';
const OMITTED_CHART_REF_REPLACEMENT =
    '*(chart omitted: its query evidence could not be verified)*';

const isChartConfigCompatible = (
    chart: AiDeepResearchWarehouseChart,
    metricQuery: {
        dimensions: string[];
        metrics: string[];
    },
): boolean => {
    const dimensions = new Set(metricQuery.dimensions);
    const metrics = new Set(metricQuery.metrics);
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
    charts: AiDeepResearchChartDefinition[];
};

const MAX_SNAPSHOT_ROWS = 500;

const toSnapshotValue = (value: unknown): AiDeepResearchChartSnapshotValue => {
    if (value === null || value === undefined) {
        return null;
    }
    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }
    return JSON.stringify(value);
};

const buildInlineChartData = (
    chart: AiDeepResearchInlineChart,
    runQueryUuids: Set<string>,
): AiDeepResearchChartData => {
    // Only provenance the agent can actually claim: queries run this session.
    const derivedFrom = (chart.derivedFrom ?? []).filter((queryUuid) =>
        runQueryUuids.has(queryUuid),
    );
    return {
        source: 'inline',
        title: chart.title,
        chartConfig: chart.chartConfig,
        queryUuid: null,
        derivedFrom: derivedFrom.length > 0 ? derivedFrom : null,
        metricQuery: buildInlineChartMetricQuery(chart),
        fields: buildInlineChartFields(chart.columns),
        snapshot: {
            takenAt: new Date().toISOString(),
            rowCount: chart.rows.length,
            truncated: false,
            columnOrder: chart.columns.map((column) => column.id),
            rows: chart.rows,
        },
    };
};

export type AiDeepResearchExecutorResult =
    | {
          status: 'completed';
          report: AiDeepResearchSubmittedReport;
          warehouseQueryUuids: string[];
      }
    | {
          status: 'partially_completed';
          report: AiDeepResearchSubmittedReport;
          warehouseQueryUuids: string[];
      }
    | { status: 'failed'; errorMessage: string }
    | { status: 'cancelled' };

export type AiDeepResearchExecutor = (
    run: DbAiDeepResearchRun,
    context: { signal: AbortSignal },
) => Promise<AiDeepResearchExecutorResult>;

type Dependencies = {
    aiDeepResearchRunModel: AiDeepResearchRunModel;
    aiAgentModel: Pick<AiAgentModel, 'findThreadOwnership'>;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    schedulerClient: CommercialSchedulerClient;
    asyncQueryService: AsyncQueryService;
    queryHistoryModel: Pick<QueryHistoryModel, 'getByQueryUuid'>;
    resultsFileStorageClient: Pick<
        S3ResultsFileStorageClient,
        'getDownloadStream'
    >;
    executor?: AiDeepResearchExecutor;
};

type EventCursorPayload = {
    createdAt: string;
    eventUuid: string;
};

const toRun = (row: DbAiDeepResearchRun): AiDeepResearchRun => ({
    aiDeepResearchRunUuid: row.ai_deep_research_run_uuid,
    projectUuid: row.project_uuid,
    aiThreadUuid: row.ai_thread_uuid,
    promptUuid: row.prompt_uuid,
    prompt: row.prompt,
    status: row.status,
    resultMarkdown: row.result_markdown,
    resultChartData: row.result_chart_data,
    budget: {
        maxTokens: row.budget_snapshot.maxTokens,
        maxToolCalls: row.budget_snapshot.maxToolCalls,
        maxWarehouseQueries: row.budget_snapshot.maxWarehouseQueries,
        maxResultRows: row.budget_snapshot.maxResultRows,
    },
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
        maxTokens: 500_000,
        maxToolCalls: 50,
        maxWarehouseQueries: 10,
        maxResultRows: 5_000,
    },
    medium: {
        maxTokens: 1_000_000,
        maxToolCalls: 125,
        maxWarehouseQueries: 25,
        maxResultRows: 10_000,
    },
    high: {
        maxTokens: 2_000_000,
        maxToolCalls: 250,
        maxWarehouseQueries: 50,
        maxResultRows: 25_000,
    },
    xhigh: {
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

    private readonly aiAgentModel: Pick<AiAgentModel, 'findThreadOwnership'>;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly queryHistoryModel: Pick<
        QueryHistoryModel,
        'getByQueryUuid'
    >;

    private readonly resultsFileStorageClient: Pick<
        S3ResultsFileStorageClient,
        'getDownloadStream'
    >;

    private readonly executor: AiDeepResearchExecutor | undefined;

    constructor({
        aiDeepResearchRunModel,
        aiAgentModel,
        projectModel,
        featureFlagModel,
        schedulerClient,
        asyncQueryService,
        queryHistoryModel,
        resultsFileStorageClient,
        executor,
    }: Dependencies) {
        super();
        this.aiDeepResearchRunModel = aiDeepResearchRunModel;
        this.aiAgentModel = aiAgentModel;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
        this.schedulerClient = schedulerClient;
        this.asyncQueryService = asyncQueryService;
        this.queryHistoryModel = queryHistoryModel;
        this.resultsFileStorageClient = resultsFileStorageClient;
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
            ) ||
            ability.cannot(
                'create',
                subject('PersonalAccessToken', {
                    organizationUuid,
                    metadata: { userUuid: user.userUuid },
                }),
            ) ||
            ability.cannot(
                'delete',
                subject('PersonalAccessToken', {
                    organizationUuid,
                    metadata: { userUuid: user.userUuid },
                }),
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
        effort?: AiDeepResearchEffort;
        budget?: AiDeepResearchBudget;
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
        const budget =
            args.budget ??
            AI_DEEP_RESEARCH_BUDGETS_BY_EFFORT[
                args.effort ?? AI_DEEP_RESEARCH_DEFAULT_EFFORT
            ];
        assertValidBudget(budget);

        await this.assertCanCreateRun(args.user, args.projectUuid);
        const featureFlag = await this.featureFlagModel.get({
            user: args.user,
            featureFlagId: FeatureFlags.AiDeepResearch,
        });
        if (!featureFlag.enabled) {
            throw new ForbiddenError('Deep Research is not enabled');
        }

        if (args.promptUuid && !args.aiThreadUuid) {
            throw new ParameterError(
                'A Deep Research prompt link requires its thread',
            );
        }
        if (args.aiThreadUuid) {
            const ownership = await this.aiAgentModel.findThreadOwnership({
                organizationUuid: args.user.organizationUuid,
                threadUuid: args.aiThreadUuid,
            });
            if (
                !ownership ||
                ownership.projectUuid !== args.projectUuid ||
                ownership.ownerUserUuid !== args.user.userUuid
            ) {
                throw new NotFoundError(
                    `AI thread ${args.aiThreadUuid} not found`,
                );
            }
        }

        const run = await this.aiDeepResearchRunModel.create({
            organizationUuid: args.user.organizationUuid,
            projectUuid: args.projectUuid,
            createdByUserUuid: args.user.userUuid,
            aiThreadUuid: args.aiThreadUuid ?? null,
            promptUuid: args.promptUuid ?? null,
            toolCallId: args.toolCallId ?? null,
            prompt: args.prompt.trim(),
            budget,
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

    async listRunsForThread(
        user: SessionUser,
        projectUuid: string,
        aiThreadUuid: string,
    ): Promise<AiDeepResearchRun[]> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        await this.assertCanViewProject(user, projectUuid);

        const runs = await this.aiDeepResearchRunModel.findByThreadScoped({
            aiThreadUuid,
            organizationUuid: user.organizationUuid,
            projectUuid,
            createdByUserUuid: user.userUuid,
        });
        return runs.map(toRun);
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
        // Membership in the persisted chart data is the authorization gate.
        const chart = run.result_chart_data?.[args.chartKey];
        if (!chart) {
            throw new NotFoundError(
                `Deep Research chart ${args.chartKey} not found`,
            );
        }
        if (chart.source !== 'warehouse') {
            throw new ParameterError(
                'Only warehouse-backed Deep Research charts can be refreshed',
            );
        }

        const query = await this.asyncQueryService.executeAsyncMetricQuery({
            account: args.account,
            projectUuid: args.projectUuid,
            metricQuery: chart.metricQuery,
            context: QueryExecutionContext.AI,
        });

        return {
            type: AiResultType.QUERY_RESULT,
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
                const report = await this.prepareEvidenceReport(
                    run,
                    result.report,
                    new Set(result.warehouseQueryUuids),
                );
                const completed =
                    await this.aiDeepResearchRunModel.markCompleted(
                        payload.aiDeepResearchRunUuid,
                        report.markdown,
                        report.chartData,
                    );
                if (!completed) {
                    await this.markCancelledAfterCompletedExecution(
                        payload.aiDeepResearchRunUuid,
                    );
                }
                return;
            }
            if (result.status === 'partially_completed') {
                const report = await this.prepareEvidenceReport(
                    run,
                    result.report,
                    new Set(result.warehouseQueryUuids),
                );
                const completed =
                    await this.aiDeepResearchRunModel.markPartiallyCompleted(
                        payload.aiDeepResearchRunUuid,
                        report.markdown,
                        report.chartData,
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

    /**
     * Turns the submitted report into the two persisted artifacts: the
     * markdown narrative and the render data for every verified chart,
     * including a snapshot of each warehouse chart's results. Charts that
     * cannot be verified or snapshotted lose their reference in the markdown.
     */
    private async prepareEvidenceReport(
        run: DbAiDeepResearchRun,
        report: AiDeepResearchSubmittedReport,
        runQueryUuids: Set<string>,
    ): Promise<{ markdown: string; chartData: AiDeepResearchChartDataMap }> {
        const chartData: AiDeepResearchChartDataMap = {};
        const omittedKeys = new Set<string>();

        await Promise.all(
            report.charts.map(async (chart) => {
                const key = getDeepResearchChartKey(chart);
                try {
                    const entry =
                        chart.source === 'warehouse'
                            ? await this.buildWarehouseChartData(
                                  run,
                                  chart,
                                  runQueryUuids,
                              )
                            : buildInlineChartData(chart, runQueryUuids);
                    if (entry) {
                        chartData[key] = entry;
                    } else {
                        omittedKeys.add(key);
                    }
                } catch (error) {
                    this.logger.error(
                        `Deep Research run ${run.ai_deep_research_run_uuid} could not prepare chart ${key}: ${getErrorMessage(error)}`,
                    );
                    omittedKeys.add(key);
                }
            }),
        );

        if (omittedKeys.size === 0) {
            return { markdown: report.markdown, chartData };
        }

        const failedRefs = findDeepResearchChartRefs(report.markdown).filter(
            (ref) => omittedKeys.has(ref.key),
        );
        const spliced = spliceDeepResearchRanges(
            report.markdown,
            failedRefs.map((ref) => ({
                match: ref,
                replacement: OMITTED_CHART_REF_REPLACEMENT,
            })),
        );
        return {
            markdown: `${spliced}\n\n<warning title="Caveat">\n\n${OMITTED_CHARTS_CAVEAT}\n\n</warning>\n`,
            chartData,
        };
    }

    private async buildWarehouseChartData(
        run: DbAiDeepResearchRun,
        chart: AiDeepResearchWarehouseChart,
        runQueryUuids: Set<string>,
    ): Promise<AiDeepResearchChartData | null> {
        // The UUID set is built from this run's actual MCP tool results.
        if (!runQueryUuids.has(chart.queryUuid)) {
            return null;
        }

        const queryHistory = await this.queryHistoryModel.getByQueryUuid(
            chart.queryUuid,
        );
        const isVerified =
            queryHistory?.context ===
                QueryExecutionContext.MCP_RUN_METRIC_QUERY &&
            queryHistory.projectUuid === run.project_uuid &&
            queryHistory.organizationUuid === run.organization_uuid &&
            queryHistory.createdByUserUuid === run.created_by_user_uuid &&
            queryHistory.createdByActorType === 'pat' &&
            queryHistory.status === QueryHistoryStatus.READY &&
            queryHistory.resultsFileName !== null &&
            (!queryHistory.resultsExpiresAt ||
                queryHistory.resultsExpiresAt > new Date()) &&
            isChartConfigCompatible(chart, queryHistory.metricQuery);
        if (!isVerified || queryHistory.resultsFileName === null) {
            return null;
        }

        return {
            source: 'warehouse',
            title: chart.title,
            chartConfig: chart.chartConfig,
            queryUuid: chart.queryUuid,
            derivedFrom: null,
            metricQuery: queryHistory.metricQuery,
            fields: queryHistory.fields,
            snapshot: await this.takeChartSnapshot(
                queryHistory.resultsFileName,
                queryHistory.metricQuery,
                queryHistory.totalRowCount,
            ),
        };
    }

    /** Reads the query's JSONL results file into a bounded snapshot. */
    private async takeChartSnapshot(
        resultsFileName: string,
        metricQuery: { dimensions: string[]; metrics: string[] },
        totalRowCount: number | null,
    ): Promise<AiDeepResearchChartSnapshot> {
        const columnOrder = [...metricQuery.dimensions, ...metricQuery.metrics];
        const stream =
            await this.resultsFileStorageClient.getDownloadStream(
                resultsFileName,
            );
        const lineReader = createInterface({
            input: stream,
            crlfDelay: Infinity,
        });

        const rows: AiDeepResearchChartSnapshotValue[][] = [];
        try {
            for await (const line of lineReader) {
                if (line.trim().length === 0) {
                    // eslint-disable-next-line no-continue
                    continue;
                }
                if (rows.length >= MAX_SNAPSHOT_ROWS) {
                    break;
                }
                const row: unknown = JSON.parse(line);
                if (typeof row !== 'object' || row === null) {
                    throw new UnexpectedServerError(
                        `Deep Research results file ${resultsFileName} has a malformed row`,
                    );
                }
                rows.push(
                    columnOrder.map((fieldId) =>
                        toSnapshotValue(
                            (row as Record<string, unknown>)[fieldId],
                        ),
                    ),
                );
            }
        } finally {
            lineReader.close();
            stream.destroy();
        }

        const rowCount = totalRowCount ?? rows.length;
        return {
            takenAt: new Date().toISOString(),
            rowCount,
            truncated: rowCount > rows.length,
            columnOrder,
            rows,
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
            await this.aiDeepResearchRunModel.markCancelled(
                aiDeepResearchRunUuid,
            );
        }
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
