import {
    AiAccessRefusedError,
    AiAgentValidatorError,
    convertAiTableCalcsSchemaToTableCalcs,
    filterAggregationCustomMetrics,
    generateVisualizationFilterExpressionToolDefinition,
    generateVisualizationToolDefinition,
    getItemId,
    getItemLabelWithoutTableName,
    getReferencedExploreParameterDefinitions,
    getRunQueryAgentViewRejectingMerge,
    getRunQueryFilterExpressionAgentViewRejectingMerge,
    getTotalFilterRules,
    getValidAiQueryLimit,
    isCustomChartTypeSlugChartConfig,
    isMergeMetricSource,
    isSlackPrompt,
    MERGE_TABLE_NAME,
    runQueryFilterExpressionToolDefinition,
    runQueryToolDefinition,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryExpressionArgsSchema,
    toolRunQueryExpressionArgsSchemaV2RejectingMerge,
    type AiArtifact,
    type AiCustomChartTypeChartArtifactConfig,
    type AiMergeChartArtifactConfig,
    type AiSemanticChartArtifactConfig,
    type DataAppVizSchema,
    type Explore,
    type ItemsMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ToolRunQueryAppliedParameters,
    type ToolRunQueryArgs,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
    type ToolRunQueryExpressionArgs,
    type ToolRunQueryExpressionResolvedArgs,
    type ToolRunQueryExpressionRuntimeArgs,
    type ToolRunQueryOutput,
    type ToolRunQueryStructuredContent,
} from '@lightdash/common';
import { tool, type Schema } from 'ai';
import Logger from '../../../../logging/logger';
import type { AgentDecisionContext } from '../decisions/agentQuestion';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import {
    getChartPresentationNote,
    getDataAnswerChart,
    resolveChartPresentation,
} from '../decisions/chartPresentation';
import { chartQualityHints } from '../decisions/chartQuality';
import { diagnoseEmptyResult } from '../decisions/emptyResults';
import { suggestSemanticFields } from '../decisions/fieldRecovery';
import {
    checkQueryIntent,
    getEmptyFilterHints,
    queryReviewNote,
} from '../decisions/queryChecks';
import {
    createQueryReviewer,
    EMPTY_QUERY_GUIDANCE,
} from '../decisions/queryReview';
import { joinedMeasureGuidance } from '../decisions/sourceEvidence';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    CreateOrUpdateArtifactFn,
    DeferSlackVisualizationFn,
    ExportCustomChartTypeImageFn,
    GetPromptFn,
    ResolveCustomChartTypeFn,
    RunAsyncMergeQueryFn,
    RunAsyncQueryFn,
    SearchFieldValuesFn,
    SendFileFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { AiAgentUnknownFieldsError } from '../utils/AiAgentUnknownFieldsError';
import {
    buildAiMergeQuery,
    buildAiMergeSourceConfigs,
} from '../utils/buildAiMergeQuery';
import {
    prepareChartAsCode,
    type ChartExportSource,
    type PreparedChartAsCode,
} from '../utils/chartAsCode';
import {
    convertQueryResultsToCsv,
    convertQueryResultsToMarkdown,
    summarizeChartedResults,
} from '../utils/convertQueryResultsToCsv';
import {
    formatFilterExpressionError,
    resolveFilterExpressionArgs,
} from '../utils/filterExpressions';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../utils/populateCustomMetricsSQL';
import {
    getContextTruncationNote,
    getQueryResultSummary,
} from '../utils/queryResultSummary';
import { serializeData } from '../utils/serializeData';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler, toolErrorOutput } from '../utils/toolErrorHandler';
import {
    validateAxisFields,
    validateCustomChartTypeChartConfig,
    validateCustomMetricFilters,
    validateCustomMetricsDefinition,
    validateFieldEntityType,
    validateFilterRules,
    validateGroupByFields,
    validateMetricDimensionFilterPlacement,
    validatePeriodComparisons,
    validateQueryParameters,
    validateSelectedFieldsExistence,
    validateSortFieldsAreSelected,
    validateTableCalculations,
} from '../utils/validators';

type RunQueryToolInput = ToolRunQueryArgs | ToolRunQueryExpressionRuntimeArgs;

const getChartExportReference = (
    queryUuid: string,
    artifact?: Pick<AiArtifact, 'artifactUuid' | 'versionUuid'>,
) =>
    artifact
        ? ` For chart-as-code export, call exportChartAsCode with the stored chart artifactUuid=${artifact.artifactUuid}, versionUuid=${artifact.versionUuid}, and queryUuid set to null. Do not reuse this turn's queryUuid in a later turn.`
        : ` If chart-as-code is requested in this turn, exportChartAsCode can reuse this execution: queryUuid=${queryUuid}.`;

const getQueryReference = ({
    prompt,
    chartConfig,
    queryUuid,
    exposeQueryUuid,
    enableDataAccess,
    slackLinksOnly,
}: {
    prompt: Awaited<ReturnType<GetPromptFn>>;
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'];
    queryUuid: string;
    exposeQueryUuid: boolean;
    enableDataAccess: boolean;
    slackLinksOnly: boolean;
}) => {
    const isShareableSlackTable =
        isSlackPrompt(prompt) &&
        enableDataAccess &&
        !slackLinksOnly &&
        (!chartConfig ||
            (!isCustomChartTypeSlugChartConfig(chartConfig) &&
                chartConfig.defaultVizType === 'table'));
    return exposeQueryUuid || isShareableSlackTable
        ? ` This execution's queryUuid is ${queryUuid}; use exactly this value to reference it.`
        : '';
};

const isTableResult = (
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'],
) =>
    !chartConfig ||
    (!isCustomChartTypeSlugChartConfig(chartConfig) &&
        chartConfig.defaultVizType === 'table');

const getChartReference = (
    prompt: Awaited<ReturnType<GetPromptFn>>,
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'],
    artifact: Pick<AiArtifact, 'versionUuid'> | undefined,
) =>
    isSlackPrompt(prompt) && artifact && !isTableResult(chartConfig)
        ? ` This chart's versionUuid is ${artifact.versionUuid}; use exactly this value to select the saved chart in your final answer.`
        : '';

const getDocumentReference = (
    chartConfig: ToolRunQueryArgsTransformed['chartConfig'],
    artifact: Pick<AiArtifact, 'versionUuid'> | undefined,
    documentsEnabled: boolean,
) => {
    if (!documentsEnabled || !artifact) return '';
    return isTableResult(chartConfig)
        ? ` To place this result in a Document, use <query-result version="${artifact.versionUuid}" display="table">, or display="big_number" for a single value.`
        : ` To place this chart in a Document, use <artifact-chart version="${artifact.versionUuid}">.`;
};

type Dependencies = {
    purpose?: 'visualization' | 'answer';
    documentsEnabled?: boolean;
    enableFastResponse?: boolean;
    decisions?: AiDecisionClient;
    question?: string;
    conversation?: AgentDecisionContext;
    presentationInstructions?: string | null;
    allowPresentationCorrection?: boolean;
    enableChartExport?: boolean;
    searchFieldValues?: SearchFieldValuesFn;
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    agentContext: AgentContext;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    deferSlackVisualization?: DeferSlackVisualizationFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxLimit: number;
    maxContextRows: number;
    /** Deep Research report charts must cite the execution they came from. */
    exposeQueryUuid: boolean;
    enableDataAccess: boolean;
    slackLinksOnly: boolean;
    // Project-level parameter definitions; model-level ones come from the explore.
    projectParameterDefinitions: ParameterDefinitions;
    enableMergeQueries: boolean;
    enableFilterExpressions: boolean;
    runAsyncMergeQuery: RunAsyncMergeQueryFn;
    resolveCustomChartType: ResolveCustomChartTypeFn;
    exportCustomChartTypeImage: ExportCustomChartTypeImageFn;
};

export const getAppliedParameters = (
    explore: Explore,
    projectParameterDefinitions: ParameterDefinitions,
    provided: ParametersValuesMap | null,
): ToolRunQueryAppliedParameters | null => {
    const definitions = getReferencedExploreParameterDefinitions(
        explore,
        projectParameterDefinitions,
    );
    const referenced = Object.keys(definitions);
    if (referenced.length === 0) return null;
    const applied = Object.fromEntries(
        referenced.flatMap((name) => {
            const value = provided?.[name];
            return value !== undefined ? [[name, value] as const] : [];
        }),
    );
    const defaulted = Object.fromEntries(
        referenced.flatMap((name) => {
            if (provided?.[name] !== undefined) return [];
            const value = definitions[name].default;
            return value !== undefined ? [[name, value] as const] : [];
        }),
    );
    const unset = referenced.filter(
        (name) =>
            provided?.[name] === undefined &&
            definitions[name].default === undefined,
    );
    return { applied, defaulted, unset };
};

const renderAppliedParameters = (
    parameters: ToolRunQueryAppliedParameters | null,
): string => {
    if (parameters === null) return '';
    const { applied, defaulted, unset } = parameters;
    const parts = [
        Object.keys(applied).length > 0
            ? `set explicitly: ${JSON.stringify(applied)}`
            : null,
        Object.keys(defaulted).length > 0
            ? `resolved to defaults: ${JSON.stringify(defaulted)}`
            : null,
        unset.length > 0 ? `unset with no default: ${unset.join(', ')}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0
        ? ` Parameter values this query ran with — ${parts.join('; ')}.`
        : '';
};

// The parameter state a query actually ran with — explicit vs
// default-resolved vs unset-with-no-default — so results never hide it.
export const summarizeAppliedParameters = (
    explore: Explore,
    projectParameterDefinitions: ParameterDefinitions,
    provided: ParametersValuesMap | null,
): string => {
    const definitions = getReferencedExploreParameterDefinitions(
        explore,
        projectParameterDefinitions,
    );
    const referenced = Object.keys(definitions);
    if (referenced.length === 0) return '';
    const applied = Object.fromEntries(
        referenced.flatMap((name) => {
            const value = provided?.[name];
            return value !== undefined ? [[name, value] as const] : [];
        }),
    );
    const defaulted = Object.fromEntries(
        referenced.flatMap((name) => {
            if (provided?.[name] !== undefined) return [];
            const value = definitions[name].default;
            return value !== undefined ? [[name, value] as const] : [];
        }),
    );
    const unset = referenced.filter(
        (name) =>
            provided?.[name] === undefined &&
            definitions[name].default === undefined,
    );
    const parts = [
        Object.keys(applied).length > 0
            ? `set explicitly: ${JSON.stringify(applied)}`
            : null,
        Object.keys(defaulted).length > 0
            ? `resolved to defaults: ${JSON.stringify(defaulted)}`
            : null,
        unset.length > 0 ? `unset with no default: ${unset.join(', ')}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0
        ? ` Parameter values this query ran with — ${parts.join('; ')}.`
        : '';
};

// The rows written into the conversation: the CSV block and the structured
// `data` are rendered from this one slice.
const selectShownRows = (
    rows: Record<string, unknown>[],
    maxContextRows: number,
    fields: ItemsMap,
): NonNullable<
    Extract<ToolRunQueryStructuredContent, { outcome: 'results' }>['data']
> => {
    const shown = rows.slice(0, maxContextRows);
    const [first] = rows;
    const fieldIds = first ? Object.keys(first) : [];
    return {
        columns: fieldIds.map((fieldId) => {
            const item = fields[fieldId];
            return item ? getItemLabelWithoutTableName(item) : fieldId;
        }),
        rows: shown.map((row) => fieldIds.map((fieldId) => row[fieldId])),
    };
};

export const validateRunQueryTool = (
    queryTool: ToolRunQueryArgsTransformed,
    explore: Explore,
) => {
    const {
        queryConfig: { dimensions, metrics, customMetrics, tableCalculations },
    } = queryTool;

    const filterRules = getTotalFilterRules(queryTool.queryConfig.filters);

    const aggregations = filterAggregationCustomMetrics(customMetrics);

    const hasFields =
        dimensions.length > 0 ||
        metrics.length > 0 ||
        (customMetrics && customMetrics.length > 0) ||
        (tableCalculations && tableCalculations.length > 0);

    if (!hasFields) {
        throw new AiAgentValidatorError(
            'Query must have at least one dimension, metric, or table calculation',
        );
    }

    // Validate dimensions
    validateFieldEntityType(
        explore,
        queryTool.queryConfig.dimensions,
        'dimension',
    );

    // Validate metrics
    validateFieldEntityType(
        explore,
        queryTool.queryConfig.metrics,
        'metric',
        aggregations,
    );

    validateCustomMetricsDefinition(explore, aggregations);
    validateCustomMetricFilters(explore, aggregations);
    validateFilterRules(
        explore,
        filterRules,
        aggregations,
        queryTool.queryConfig.tableCalculations,
    );
    validateMetricDimensionFilterPlacement(
        explore,
        aggregations,
        queryTool.queryConfig.tableCalculations,
        queryTool.queryConfig.filters,
    );

    // groupBy/axis checks only apply to the builtin branch; the custom chart
    // type branch is validated separately against the type's schema.
    const builtinChartConfig = isCustomChartTypeSlugChartConfig(
        queryTool.chartConfig,
    )
        ? null
        : queryTool.chartConfig;

    // Validate groupBy fields
    validateGroupByFields(
        explore,
        builtinChartConfig?.groupBy,
        queryTool.queryConfig.dimensions,
    );

    // Validate axis fields
    validateAxisFields(
        builtinChartConfig,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        queryTool.queryConfig.tableCalculations,
        aggregations,
    );

    // Validate sort fields exist
    validateSelectedFieldsExistence(
        explore,
        queryTool.queryConfig.sorts.map((sort) => sort.fieldId),
        aggregations,
        queryTool.queryConfig.tableCalculations,
    );

    validateSortFieldsAreSelected(
        queryTool.queryConfig.sorts,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        aggregations,
        queryTool.queryConfig.tableCalculations,
    );

    // Validate table calculations
    validateTableCalculations(
        explore,
        queryTool.queryConfig.tableCalculations,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        aggregations,
    );

    // Validate period-over-period comparisons (entries from customMetrics)
    validatePeriodComparisons(
        explore,
        customMetrics,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        aggregations,
    );
};

type ResolvedRunQueryArtifactConfig =
    | AiSemanticChartArtifactConfig
    | AiMergeChartArtifactConfig
    | AiCustomChartTypeChartArtifactConfig;

const buildResolvedRunQueryArtifactConfig = ({
    persistedArgs,
    dataAppVizUuid,
    dataAppVizVersion,
}: {
    persistedArgs: ToolRunQueryExpressionResolvedArgs;
    dataAppVizUuid: string | null;
    dataAppVizVersion: number | null;
}): ResolvedRunQueryArtifactConfig => {
    if (persistedArgs.mergeConfig !== null) {
        return {
            source: 'merge',
            schemaVersion: 1,
            config: persistedArgs,
        };
    }

    if (dataAppVizUuid !== null && dataAppVizVersion !== null) {
        return {
            source: 'customChartType',
            schemaVersion: 1,
            dataAppVizUuid,
            dataAppVizVersion,
            config: persistedArgs,
        };
    }

    return {
        source: 'semantic',
        config: persistedArgs,
    };
};

// Images are registered for delivery after the final answer selects its charts.
// If registration is unavailable, the selected chart still has a Lightdash link.
const deferSlackChart = async ({
    queryTool,
    queryResults,
    artifact,
    deferSlackVisualization,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    queryResults: { queryUuid: string; rows: Record<string, unknown>[] };
    artifact: AiArtifact | undefined;
    deferSlackVisualization?: DeferSlackVisualizationFn;
}): Promise<void> => {
    if (
        !artifact ||
        !deferSlackVisualization ||
        !queryTool.chartConfig ||
        (!isCustomChartTypeSlugChartConfig(queryTool.chartConfig) &&
            !['bar', 'horizontal', 'line', 'scatter', 'pie', 'funnel'].includes(
                queryTool.chartConfig.defaultVizType,
            ))
    ) {
        return;
    }
    try {
        await deferSlackVisualization({
            artifactUuid: artifact.artifactUuid,
            versionUuid: artifact.versionUuid,
            queryUuid: queryResults.queryUuid,
            rowLimit: queryResults.rows.length,
            queryTool,
        });
    } catch {
        Logger.warn(
            '[AiAgent] Deferred Slack image unavailable; retaining the chart link.',
        );
    }
};

const getSuccessMetadata = ({
    queryUuid,
    queryCacheHit,
    queryReuseHit,
    chartImageUrl,
    artifact,
    deferredSlack: _deferredSlack,
    fastResponse,
}: {
    queryUuid: string;
    queryCacheHit: boolean;
    queryReuseHit: boolean;
    chartImageUrl?: string;
    artifact?: AiArtifact;
    deferredSlack: boolean;
    fastResponse?: string;
}) => ({
    status: 'success' as const,
    chartImageUrl,
    ...(artifact ? { artifactVersionUuid: artifact.versionUuid } : {}),
    queryUuid,
    queryCacheHit,
    queryReuseHit,
    ...(fastResponse ? { fastResponse } : {}),
});

const registerChartExport = ({
    enabled,
    context,
    queryUuid,
    source,
}: {
    enabled: boolean;
    context: AgentContext;
    queryUuid: string;
    source: ChartExportSource;
}): PreparedChartAsCode | undefined => {
    if (!enabled) return undefined;
    try {
        const chart = prepareChartAsCode(source);
        context.registerChartExport(queryUuid, source);
        return chart;
    } catch {
        Logger.warn(
            '[AiAgent] Chart export preparation unavailable; visualization is still available.',
        );
        return undefined;
    }
};

/** A charted answer reads as one factual line; anything else stays a table. */
const getFastAnswerText = (
    queryResults: { rows: Record<string, unknown>[]; fields: ItemsMap },
    chart: ToolRunQueryBuiltinChartConfig | null,
): string | null =>
    (chart ? summarizeChartedResults(queryResults, chart) : null) ??
    convertQueryResultsToMarkdown(queryResults);

export const getRunQuery = ({
    purpose = 'visualization',
    documentsEnabled = false,
    enableFastResponse = false,
    updateProgress,
    runAsyncQuery,
    agentContext: ctx,
    getPrompt,
    deferSlackVisualization,
    createOrUpdateArtifact,
    maxLimit,
    maxContextRows,
    exposeQueryUuid,
    enableDataAccess,
    slackLinksOnly,
    projectParameterDefinitions,
    enableMergeQueries,
    enableFilterExpressions,
    runAsyncMergeQuery,
    resolveCustomChartType,
    decisions,
    question,
    conversation,
    presentationInstructions,
    allowPresentationCorrection,
    enableChartExport = false,
    searchFieldValues,
}: Dependencies) => {
    const fastAnswer = enableFastResponse && purpose === 'answer';
    const toolView = (() => {
        if (enableFilterExpressions) {
            return enableMergeQueries
                ? (purpose === 'answer'
                      ? runQueryFilterExpressionToolDefinition
                      : generateVisualizationFilterExpressionToolDefinition
                  ).for('agent')
                : getRunQueryFilterExpressionAgentViewRejectingMerge();
        }
        return enableMergeQueries
            ? (purpose === 'answer'
                  ? runQueryToolDefinition
                  : generateVisualizationToolDefinition
              ).for('agent')
            : getRunQueryAgentViewRejectingMerge();
    })();
    const { inputSchema: rawInputSchema, description: baseDescription } =
        toolView;
    const inputSchema: Schema<RunQueryToolInput> = rawInputSchema;
    let description = baseDescription;
    if (purpose === 'answer') {
        description = `${baseDescription} Use this when the user wants a data answer without a visualization. Set chartConfig to null. It returns query rows and saves them as a table artifact, so follow-up edits can refine it; Slack also receives an explorable result card.`;
    } else if (decisions && enableDataAccess) {
        description = `${baseDescription} For builtin charts, you can set chartConfig to null: the server selects a validated default from the question and actual result shape. Supply chartConfig when explicit presentation settings are needed. Query fields, filters and limits are always your responsibility.`;
    }

    return tool({
        ...toolView,
        description,
        inputSchema,
        execute: async (
            toolArgs,
        ): Promise<ToolRunQueryOutput | ExecuteToolErrorResult> => {
            try {
                await updateProgress('Running your query...');

                let queryTool: ToolRunQueryArgsTransformed;
                let persistedExpressionArgs: ToolRunQueryExpressionResolvedArgs | null =
                    null;

                if (enableFilterExpressions) {
                    let normalizedExpressionToolArgs: ToolRunQueryExpressionArgs;
                    if (enableMergeQueries) {
                        normalizedExpressionToolArgs =
                            toolRunQueryExpressionArgsSchema.parse(toolArgs);
                    } else {
                        const parsedExpressionToolArgs =
                            toolRunQueryExpressionArgsSchemaV2RejectingMerge.parse(
                                toolArgs,
                            );
                        normalizedExpressionToolArgs = {
                            ...parsedExpressionToolArgs,
                            mergeConfig: null,
                        };
                    }
                    const resolution = await resolveFilterExpressionArgs({
                        toolArgs: normalizedExpressionToolArgs,
                        getExplore: (exploreName) =>
                            ctx.getExplore(exploreName),
                    });
                    if (!resolution.success) {
                        const { error } = resolution;
                        const fieldAdvice =
                            decisions &&
                            error.code === 'FILTER_EXPRESSION_UNKNOWN_FIELD' &&
                            error.reason === 'notFound' &&
                            error.source.category !== 'tableCalculations'
                                ? await suggestSemanticFields({
                                      decisions,
                                      question: question ?? '',
                                      error: new AiAgentUnknownFieldsError(
                                          error.problem,
                                          ctx.getExplore(
                                              error.source.exploreName,
                                          ),
                                          [error.fieldId],
                                          error.source.category === 'metrics'
                                              ? 'metric'
                                              : 'dimension',
                                      ),
                                  })
                                : '';
                        const result =
                            formatFilterExpressionError(resolution.error) +
                            fieldAdvice;
                        return {
                            result,
                            metadata: { status: 'error' as const },
                            structuredContent: { error: result },
                        };
                    }

                    queryTool = resolution.data.transformed;
                    persistedExpressionArgs = resolution.data.persistedArgs;
                } else {
                    queryTool =
                        toolRunQueryArgsSchemaTransformed.parse(toolArgs);
                }

                if (purpose === 'answer') {
                    queryTool = { ...queryTool, chartConfig: null };
                    if (persistedExpressionArgs) {
                        persistedExpressionArgs = {
                            ...persistedExpressionArgs,
                            chartConfig: null,
                        };
                    }
                }
                const artifactToolArgs =
                    purpose === 'answer'
                        ? { ...toolArgs, chartConfig: null }
                        : toolArgs;

                const explore = ctx.getExplore(
                    queryTool.queryConfig.exploreName,
                );

                if (!queryTool.mergeConfig) {
                    validateRunQueryTool(queryTool, explore);
                    validateQueryParameters(
                        queryTool.queryConfig.parameters,
                        explore,
                        projectParameterDefinitions,
                    );
                }

                // Merge × custom chart type has no defined contract yet —
                // reject explicitly rather than silently falling back.
                if (
                    queryTool.mergeConfig &&
                    isCustomChartTypeSlugChartConfig(queryTool.chartConfig)
                ) {
                    throw new AiAgentValidatorError(
                        'Custom chart types cannot be combined with mergeConfig. Either set mergeConfig to null to render this answer through the custom chart type, or keep the merge and use a builtin chartConfig.',
                    );
                }

                const prompt = await getPrompt();

                if (queryTool.mergeConfig) {
                    if (!enableMergeQueries) {
                        throw new AiAgentValidatorError(
                            'Merge queries are not enabled for this organization.',
                        );
                    }

                    buildAiMergeSourceConfigs(queryTool).forEach(
                        ({ queryConfig }) => {
                            const sourceExplore = ctx.getExplore(
                                queryConfig.exploreName,
                            );
                            const sourceTool = {
                                ...queryTool,
                                queryConfig,
                                chartConfig: null,
                                mergeConfig: null,
                            };
                            validateRunQueryTool(sourceTool, sourceExplore);
                            validateQueryParameters(
                                queryConfig.parameters,
                                sourceExplore,
                                projectParameterDefinitions,
                            );
                        },
                    );
                    const mergeQuery = buildAiMergeQuery({
                        toolArgs: queryTool,
                        getExplore: (exploreName) =>
                            ctx.getExplore(exploreName),
                        maxQueryLimit: maxLimit,
                    });

                    // Custom chart configs were rejected above; the guard
                    // narrows chartConfig to the builtin branch.
                    if (
                        queryTool.chartConfig &&
                        !isCustomChartTypeSlugChartConfig(queryTool.chartConfig)
                    ) {
                        // Merged output columns are fields of the merge/source
                        // "tables", so getItemId is the naming authority.
                        const dimensionIds = queryTool.mergeConfig.joinKey.map(
                            (part) =>
                                getItemId({
                                    table: MERGE_TABLE_NAME,
                                    name: part.name,
                                }),
                        );
                        const metricIds = mergeQuery.sources
                            .filter(isMergeMetricSource)
                            .flatMap((source) =>
                                source.metricQuery.metrics.map((metricId) =>
                                    getItemId({
                                        table: source.id,
                                        name: metricId,
                                    }),
                                ),
                            );
                        const selected = new Set([
                            ...dimensionIds,
                            ...metricIds,
                        ]);
                        const configuredFields = [
                            queryTool.chartConfig.xAxisDimension,
                            ...(queryTool.chartConfig.yAxisMetrics ?? []),
                            ...(queryTool.chartConfig.groupBy ?? []),
                            queryTool.chartConfig.secondaryYAxisMetric,
                        ].filter((field): field is string => field !== null);
                        const unknownFields = configuredFields.filter(
                            (field) => !selected.has(field),
                        );
                        if (unknownFields.length > 0) {
                            throw new AiAgentValidatorError(
                                `Merged chart references unknown fields: ${unknownFields.join(
                                    ', ',
                                )}. Available fields: ${[
                                    ...dimensionIds,
                                    ...metricIds,
                                ].join(', ')}.`,
                            );
                        }
                    }

                    const createMergeArtifactHook = (
                        chartConfig: ToolRunQueryBuiltinChartConfig | null = null,
                        contentAsCode?: PreparedChartAsCode,
                    ) => {
                        const vizConfig =
                            persistedExpressionArgs === null
                                ? {
                                      source: 'merge' as const,
                                      schemaVersion: 1 as const,
                                      config: chartConfig
                                          ? { ...artifactToolArgs, chartConfig }
                                          : artifactToolArgs,
                                  }
                                : buildResolvedRunQueryArtifactConfig({
                                      persistedArgs: chartConfig
                                          ? {
                                                ...persistedExpressionArgs,
                                                chartConfig,
                                            }
                                          : persistedExpressionArgs,
                                      dataAppVizUuid: null,
                                      dataAppVizVersion: null,
                                  });
                        return ctx.measureStage('render', () =>
                            createOrUpdateArtifact({
                                threadUuid: prompt.threadUuid,
                                promptUuid: prompt.promptUuid,
                                artifactType: 'chart',
                                title: toolArgs.title,
                                description: toolArgs.description,
                                vizConfig: contentAsCode
                                    ? { ...vizConfig, contentAsCode }
                                    : vizConfig,
                            }),
                        );
                    };

                    if (
                        !enableDataAccess &&
                        (!isSlackPrompt(prompt) || slackLinksOnly)
                    ) {
                        const artifact = await createMergeArtifactHook();
                        return {
                            result: `Success${getChartReference(prompt, queryTool.chartConfig, artifact)}${getDocumentReference(queryTool.chartConfig, artifact, documentsEnabled)}`,
                            metadata: {
                                status: 'success',
                                ...(isSlackPrompt(prompt) && artifact
                                    ? {
                                          artifactVersionUuid:
                                              artifact.versionUuid,
                                      }
                                    : {}),
                            },
                            structuredContent: {
                                outcome: 'chartOnly',
                                chartVersionUuid:
                                    getChartReference(
                                        prompt,
                                        queryTool.chartConfig,
                                        artifact,
                                    ) && artifact
                                        ? artifact.versionUuid
                                        : null,
                            },
                        };
                    }

                    const [queryResults, review] = await Promise.all([
                        ctx.measureStage('query', () =>
                            runAsyncMergeQuery(
                                mergeQuery,
                                queryTool.queryConfig.parameters ?? undefined,
                            ),
                        ),
                        decisions && enableDataAccess
                            ? createQueryReviewer({
                                  decisions,
                                  question: question ?? prompt.prompt,
                                  conversation,
                                  explores: ctx.getAvailableExplores(),
                              })({
                                  kind: 'merge',
                                  query: mergeQuery,
                                  parameters: queryTool.queryConfig.parameters,
                              })
                            : '',
                    ]);

                    if (queryResults.rows.length === 0) {
                        const diagnosis =
                            decisions && enableDataAccess
                                ? await diagnoseEmptyResult({
                                      decisions,
                                      question: question ?? prompt.prompt,
                                      conversation,
                                      explores: ctx.getAvailableExplores(),
                                      plan: {
                                          kind: 'merge',
                                          query: mergeQuery,
                                          parameters:
                                              queryTool.queryConfig.parameters,
                                      },
                                      review,
                                  })
                                : NO_RESULTS_RETRY_PROMPT;
                        return {
                            result: diagnosis,
                            metadata: { status: 'success' },
                            structuredContent: {
                                outcome: 'noResults',
                                rowCount: 0,
                                parameters: null,
                                review:
                                    decisions && enableDataAccess
                                        ? diagnosis
                                        : null,
                            },
                        };
                    }

                    const presentation =
                        purpose === 'visualization' &&
                        decisions &&
                        enableDataAccess
                            ? await resolveChartPresentation({
                                  decisions,
                                  question: question ?? prompt.prompt,
                                  instructions: presentationInstructions,
                                  allowCorrection: allowPresentationCorrection,
                                  query: {
                                      ...queryTool,
                                      queryConfig: {
                                          ...queryTool.queryConfig,
                                          dimensions:
                                              queryResults.metricQuery
                                                  .dimensions,
                                          metrics:
                                              queryResults.metricQuery.metrics,
                                          tableCalculations: null,
                                      },
                                  },
                                  explore,
                                  rows: queryResults.rows,
                                  resultFields: queryResults.fields,
                              })
                            : {
                                  config: fastAnswer
                                      ? getDataAnswerChart({
                                            query: {
                                                ...queryTool,
                                                queryConfig: {
                                                    ...queryTool.queryConfig,
                                                    dimensions:
                                                        queryResults.metricQuery
                                                            .dimensions,
                                                    metrics:
                                                        queryResults.metricQuery
                                                            .metrics,
                                                    tableCalculations: null,
                                                },
                                            },
                                            explore,
                                            rows: queryResults.rows,
                                            resultFields: queryResults.fields,
                                        })
                                      : null,
                                  advice: [],
                              };
                    if (presentation.config)
                        queryTool = {
                            ...queryTool,
                            chartConfig: presentation.config,
                        };
                    const presentationNote =
                        getChartPresentationNote(presentation);
                    const portableChart = registerChartExport({
                        enabled: enableChartExport && enableDataAccess,
                        context: ctx,
                        queryUuid: queryResults.queryUuid,
                        source: {
                            queryTool,
                            metricQuery: queryResults.metricQuery,
                            fields: queryResults.fields,
                            mergeQuery,
                        },
                    });
                    const artifact = await createMergeArtifactHook(
                        presentation.config,
                        portableChart,
                    );

                    let exportReference = '';
                    if (portableChart)
                        exportReference = getChartExportReference(
                            queryResults.queryUuid,
                            artifact,
                        );

                    if (
                        isSlackPrompt(prompt) &&
                        enableDataAccess &&
                        !slackLinksOnly &&
                        (!queryTool.chartConfig ||
                            (!isCustomChartTypeSlugChartConfig(
                                queryTool.chartConfig,
                            ) &&
                                queryTool.chartConfig.defaultVizType ===
                                    'table'))
                    ) {
                        ctx.registerSlackTableResults(
                            queryResults.queryUuid,
                            queryResults,
                        );
                    }

                    const chartReference = `${getChartReference(
                        prompt,
                        queryTool.chartConfig,
                        artifact,
                    )}${getDocumentReference(queryTool.chartConfig, artifact, documentsEnabled)}`;
                    if (isSlackPrompt(prompt) && !slackLinksOnly) {
                        await deferSlackChart({
                            queryTool,
                            queryResults,
                            artifact,
                            deferSlackVisualization,
                        });
                    }

                    const resultSummary = getQueryResultSummary({
                        rowCount: queryResults.rows.length,
                        requestedLimit: queryTool.queryConfig.limit,
                        effectiveLimit: mergeQuery.limit,
                        maxLimit,
                    });
                    const csv = convertQueryResultsToCsv(
                        queryResults,
                        maxContextRows,
                    );
                    const queryReference = getQueryReference({
                        prompt,
                        chartConfig: queryTool.chartConfig,
                        queryUuid: queryResults.queryUuid,
                        exposeQueryUuid: false,
                        enableDataAccess,
                        slackLinksOnly,
                    });
                    const shownMergeRows = selectShownRows(
                        queryResults.rows,
                        maxContextRows,
                        queryResults.fields,
                    );
                    const mergeLimit = {
                        requested:
                            queryResults.rows.length >= mergeQuery.limit
                                ? queryTool.queryConfig.limit
                                : null,
                        effective: mergeQuery.limit,
                        max:
                            queryResults.rows.length >= mergeQuery.limit &&
                            (queryTool.queryConfig.limit === null ||
                                queryTool.queryConfig.limit > maxLimit)
                                ? maxLimit
                                : null,
                    };
                    const mergeTruncationNote = getContextTruncationNote({
                        rowCount: queryResults.rows.length,
                        maxContextRows,
                    });
                    const mergeChartQualityNote = decisions
                        ? chartQualityHints(queryTool, queryResults.rows)
                        : '';
                    return {
                        result: enableDataAccess
                            ? [
                                  `${resultSummary}${queryReference}${chartReference}${mergeTruncationNote}${exportReference}${review}${presentationNote}${mergeChartQualityNote}`,
                                  serializeData(csv, 'csv'),
                              ].join('\n\n')
                            : `Success. ${resultSummary}${chartReference}`,
                        metadata: getSuccessMetadata({
                            queryUuid: queryResults.queryUuid,
                            queryCacheHit:
                                queryResults.cacheMetadata.cacheHit === true,
                            queryReuseHit:
                                queryResults.cacheMetadata.queryReuseHit ===
                                true,
                            artifact,
                            deferredSlack: !!deferSlackVisualization,
                            fastResponse:
                                fastAnswer && enableDataAccess
                                    ? (getFastAnswerText(
                                          queryResults,
                                          presentation.config,
                                      ) ?? undefined)
                                    : undefined,
                        }),
                        structuredContent: {
                            outcome: 'results',
                            // Each note or id is carried exactly when the text states it.
                            queryUuid:
                                queryReference || (portableChart && !artifact)
                                    ? queryResults.queryUuid
                                    : null,
                            chartVersionUuid:
                                chartReference && artifact
                                    ? artifact.versionUuid
                                    : null,
                            chartExport:
                                portableChart && artifact
                                    ? {
                                          artifactUuid: artifact.artifactUuid,
                                          versionUuid: artifact.versionUuid,
                                      }
                                    : null,
                            truncationNote:
                                enableDataAccess && mergeTruncationNote
                                    ? mergeTruncationNote
                                    : null,
                            review: enableDataAccess && review ? review : null,
                            presentationNote:
                                enableDataAccess && presentationNote
                                    ? presentationNote
                                    : null,
                            chartQualityNote:
                                enableDataAccess && mergeChartQualityNote
                                    ? mergeChartQualityNote
                                    : null,
                            sourceCoverageNote: null,
                            rowCount: queryResults.rows.length,
                            limit: mergeLimit,
                            parameters: null,
                            data: enableDataAccess ? shownMergeRows : null,
                        },
                    };
                }

                // Custom chart type answers: resolve the slug project-scoped
                // and validate the field mapping against the type's schema.
                // The resolved uuid is persisted beside the replay payload.
                let customChartTypeBinding: {
                    dataAppVizUuid: string;
                    dataAppVizVersion: number;
                    fields: DataAppVizSchema['fields'];
                } | null = null;
                if (isCustomChartTypeSlugChartConfig(queryTool.chartConfig)) {
                    const customChartConfig = queryTool.chartConfig;
                    const resolved = await resolveCustomChartType(
                        customChartConfig.customChartTypeSlug,
                    );
                    if (!resolved) {
                        throw new AiAgentValidatorError(
                            `Custom chart type "${customChartConfig.customChartTypeSlug}" was not found in this project. Use findCustomChartTypes to browse the available types and their slugs.`,
                        );
                    }
                    const aggregations = filterAggregationCustomMetrics(
                        queryTool.queryConfig.customMetrics,
                    );
                    validateCustomChartTypeChartConfig(
                        customChartConfig,
                        resolved.schema,
                        {
                            dimensions: queryTool.queryConfig.dimensions,
                            metrics: [
                                ...queryTool.queryConfig.metrics,
                                ...(aggregations ?? []).map(getItemId),
                            ],
                            tableCalculations: (
                                queryTool.queryConfig.tableCalculations ?? []
                            ).map((tableCalc) => tableCalc.name),
                        },
                    );
                    customChartTypeBinding = {
                        dataAppVizUuid: resolved.dataAppVizUuid,
                        dataAppVizVersion: resolved.dataAppVizVersion,
                        fields: resolved.schema.fields,
                    };
                }

                const populatedCustomMetrics = populateCustomMetricsSQL(
                    queryTool.queryConfig.customMetrics,
                    explore,
                );

                const expandedMetrics = expandMetricsWithPopAdditionalMetrics(
                    queryTool.queryConfig.metrics,
                    populatedCustomMetrics,
                );

                // Mirror the expansion into the saved tool args so the chart
                // renders the comparison series on the y-axis. The agent
                // emits yAxisMetrics with only the base metric id (it can't
                // know the auto-generated PoP ids); the server fills them
                // in here before persisting the artifact.
                let expandedToolArgs: typeof toolArgs = artifactToolArgs;
                if (
                    expandedMetrics.length >
                        queryTool.queryConfig.metrics.length &&
                    artifactToolArgs.chartConfig &&
                    !isCustomChartTypeSlugChartConfig(
                        artifactToolArgs.chartConfig,
                    )
                ) {
                    expandedToolArgs = {
                        ...artifactToolArgs,
                        chartConfig: {
                            ...artifactToolArgs.chartConfig,
                            yAxisMetrics: expandMetricsWithPopAdditionalMetrics(
                                artifactToolArgs.chartConfig.yAxisMetrics,
                                populatedCustomMetrics,
                            ),
                        },
                    };
                }

                const expandedPersistedExpressionArgs =
                    persistedExpressionArgs !== null &&
                    expandedMetrics.length >
                        queryTool.queryConfig.metrics.length &&
                    persistedExpressionArgs.chartConfig &&
                    !isCustomChartTypeSlugChartConfig(
                        persistedExpressionArgs.chartConfig,
                    )
                        ? {
                              ...persistedExpressionArgs,
                              chartConfig: {
                                  ...persistedExpressionArgs.chartConfig,
                                  yAxisMetrics:
                                      expandMetricsWithPopAdditionalMetrics(
                                          persistedExpressionArgs.chartConfig
                                              .yAxisMetrics,
                                          populatedCustomMetrics,
                                      ),
                              },
                          }
                        : persistedExpressionArgs;

                const structuredArtifactConfig =
                    customChartTypeBinding === null
                        ? {
                              source: 'semantic',
                              config: expandedToolArgs,
                          }
                        : {
                              // Envelope: model output verbatim,
                              // server-derived uuid beside it.
                              source: 'customChartType',
                              schemaVersion: 1,
                              dataAppVizUuid:
                                  customChartTypeBinding.dataAppVizUuid,
                              dataAppVizVersion:
                                  customChartTypeBinding.dataAppVizVersion,
                              config: toolArgs,
                          };
                const artifactConfig =
                    expandedPersistedExpressionArgs === null
                        ? structuredArtifactConfig
                        : buildResolvedRunQueryArtifactConfig({
                              persistedArgs: expandedPersistedExpressionArgs,
                              dataAppVizUuid:
                                  customChartTypeBinding?.dataAppVizUuid ??
                                  null,
                              dataAppVizVersion:
                                  customChartTypeBinding?.dataAppVizVersion ??
                                  null,
                          });

                const createOrUpdateArtifactHook = (
                    chartConfig: ToolRunQueryBuiltinChartConfig | null = null,
                    contentAsCode?: PreparedChartAsCode,
                ) => {
                    const vizConfig =
                        chartConfig && customChartTypeBinding === null
                            ? {
                                  ...artifactConfig,
                                  config: {
                                      ...artifactConfig.config,
                                      chartConfig,
                                  },
                              }
                            : artifactConfig;
                    return ctx.measureStage('render', () =>
                        createOrUpdateArtifact({
                            threadUuid: prompt.threadUuid,
                            promptUuid: prompt.promptUuid,
                            artifactType: 'chart',
                            title: toolArgs.title,
                            description: toolArgs.description,
                            vizConfig: contentAsCode
                                ? { ...vizConfig, contentAsCode }
                                : vizConfig,
                        }),
                    );
                };

                // Early artifact creation for non-data-access mode
                if (
                    !enableDataAccess &&
                    (!isSlackPrompt(prompt) || slackLinksOnly)
                ) {
                    const artifact = await createOrUpdateArtifactHook();
                    return {
                        result: `Success${getChartReference(prompt, queryTool.chartConfig, artifact)}${getDocumentReference(queryTool.chartConfig, artifact, documentsEnabled)}`,
                        metadata: {
                            status: 'success',
                            ...(isSlackPrompt(prompt) && artifact
                                ? { artifactVersionUuid: artifact.versionUuid }
                                : {}),
                        },
                        structuredContent: {
                            outcome: 'chartOnly',
                            chartVersionUuid:
                                getChartReference(
                                    prompt,
                                    queryTool.chartConfig,
                                    artifact,
                                ) && artifact
                                    ? artifact.versionUuid
                                    : null,
                        },
                    };
                }

                const appliedParameters = getAppliedParameters(
                    explore,
                    projectParameterDefinitions,
                    queryTool.queryConfig.parameters,
                );

                const requestedLimit = queryTool.queryConfig.limit;
                const effectiveLimit = getValidAiQueryLimit(
                    requestedLimit,
                    maxLimit,
                );

                const metricQuery = {
                    exploreName: queryTool.queryConfig.exploreName,
                    dimensions: queryTool.queryConfig.dimensions,
                    metrics: expandedMetrics,
                    sorts: queryTool.queryConfig.sorts.map((sort) => ({
                        ...sort,
                        nullsFirst: sort.nullsFirst ?? undefined,
                    })),
                    limit: effectiveLimit,
                    filters: queryTool.queryConfig.filters,
                    additionalMetrics: populatedCustomMetrics,
                    customMetrics: queryTool.queryConfig.customMetrics,
                    tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                        queryTool.queryConfig.tableCalculations,
                    ),
                };

                // Semantic checks advise the model; they must not reject a
                // valid intermediate query. Overlap them with warehouse work.
                const [queryResults, intentIssues] = await Promise.all([
                    ctx.measureStage('query', () =>
                        runAsyncQuery(
                            metricQuery,
                            populatedCustomMetrics,
                            queryTool.queryConfig.parameters ?? undefined,
                            ...((decisions &&
                            purpose === 'visualization' &&
                            ctx.previousQueryUuid
                                ? [undefined, ctx.previousQueryUuid]
                                : []) as [AbortSignal?, string?]),
                        ),
                    ),
                    decisions && enableDataAccess
                        ? checkQueryIntent({
                              decisions,
                              question: question ?? prompt.prompt,
                              query: {
                                  queryConfig: {
                                      ...metricQuery,
                                      parameters:
                                          queryTool.queryConfig.parameters,
                                  },
                              },
                              explore,
                              conversation,
                          })
                        : [],
                ]);
                const intentNote = queryReviewNote(intentIssues);

                if (queryResults.rows.length === 0) {
                    // Diagnosis and optional value lookup share the same wait window.
                    const [diagnosis, valueHints] = await Promise.all([
                        decisions && enableDataAccess
                            ? diagnoseEmptyResult({
                                  decisions,
                                  question: question ?? prompt.prompt,
                                  conversation,
                                  explores: [explore],
                                  plan: {
                                      kind: 'semantic',
                                      query: metricQuery,
                                      parameters:
                                          queryTool.queryConfig.parameters,
                                  },
                                  review: intentNote,
                              })
                            : NO_RESULTS_RETRY_PROMPT,
                        decisions && enableDataAccess && searchFieldValues
                            ? getEmptyFilterHints({
                                  decisions,
                                  query: queryTool,
                                  searchFieldValues,
                              })
                            : '',
                    ]);
                    const emptyResultText = valueHints
                        ? `${EMPTY_QUERY_GUIDANCE} ${valueHints}${intentNote}`
                        : diagnosis;
                    return {
                        result:
                            emptyResultText +
                            summarizeAppliedParameters(
                                explore,
                                projectParameterDefinitions,
                                queryTool.queryConfig.parameters,
                            ),
                        metadata: { status: 'success' },
                        structuredContent: {
                            outcome: 'noResults',
                            rowCount: 0,
                            parameters: appliedParameters,
                            review:
                                decisions && enableDataAccess
                                    ? emptyResultText
                                    : null,
                        },
                    };
                }

                const presentation =
                    purpose === 'visualization' && decisions && enableDataAccess
                        ? await resolveChartPresentation({
                              decisions,
                              question: question ?? prompt.prompt,
                              instructions: presentationInstructions,
                              allowCorrection: allowPresentationCorrection,
                              query: queryTool,
                              explore,
                              rows: queryResults.rows,
                              resultFields: queryResults.fields,
                          })
                        : {
                              config: fastAnswer
                                  ? getDataAnswerChart({
                                        query: queryTool,
                                        explore,
                                        rows: queryResults.rows,
                                        resultFields: queryResults.fields,
                                    })
                                  : null,
                              advice: [],
                          };
                let defaultChart = presentation.config;
                if (defaultChart) {
                    const presentedQuery = {
                        ...queryTool,
                        chartConfig: defaultChart,
                    };
                    validateRunQueryTool(presentedQuery, explore);
                    queryTool = presentedQuery;
                    defaultChart = {
                        ...defaultChart,
                        yAxisMetrics: expandMetricsWithPopAdditionalMetrics(
                            defaultChart.yAxisMetrics,
                            populatedCustomMetrics,
                        ),
                    };
                }
                const presentationNote = getChartPresentationNote({
                    ...presentation,
                    config: defaultChart,
                });
                const { customMetrics: _customMetrics, ...savedQuery } =
                    metricQuery;
                const portableChart = registerChartExport({
                    enabled: enableChartExport && enableDataAccess,
                    context: ctx,
                    queryUuid: queryResults.queryUuid,
                    source: {
                        queryTool: {
                            ...queryTool,
                            chartConfig:
                                defaultChart ?? expandedToolArgs.chartConfig,
                        },
                        metricQuery: savedQuery,
                        fields: queryResults.fields,
                        customChartType: customChartTypeBinding ?? undefined,
                    },
                });
                const artifact = await createOrUpdateArtifactHook(
                    defaultChart,
                    portableChart,
                );
                const exportReference = portableChart
                    ? getChartExportReference(queryResults.queryUuid, artifact)
                    : '';

                if (
                    isSlackPrompt(prompt) &&
                    enableDataAccess &&
                    !slackLinksOnly &&
                    (!queryTool.chartConfig ||
                        (!isCustomChartTypeSlugChartConfig(
                            queryTool.chartConfig,
                        ) &&
                            queryTool.chartConfig.defaultVizType === 'table'))
                ) {
                    ctx.registerSlackTableResults(
                        queryResults.queryUuid,
                        queryResults,
                    );
                }

                const chartReference = `${getChartReference(
                    prompt,
                    queryTool.chartConfig,
                    artifact,
                )}${getDocumentReference(queryTool.chartConfig, artifact, documentsEnabled)}`;
                if (isSlackPrompt(prompt) && !slackLinksOnly) {
                    await deferSlackChart({
                        queryTool,
                        queryResults,
                        artifact,
                        deferSlackVisualization,
                    });
                }

                const resultSummary =
                    getQueryResultSummary({
                        rowCount: queryResults.rows.length,
                        requestedLimit,
                        effectiveLimit,
                        maxLimit,
                    }) +
                    summarizeAppliedParameters(
                        explore,
                        projectParameterDefinitions,
                        queryTool.queryConfig.parameters,
                    );

                const queryReference = getQueryReference({
                    prompt,
                    chartConfig: queryTool.chartConfig,
                    queryUuid: queryResults.queryUuid,
                    exposeQueryUuid,
                    enableDataAccess,
                    slackLinksOnly,
                });

                if (!enableDataAccess) {
                    return {
                        result: `Success. ${resultSummary}${queryReference}${chartReference}`,
                        metadata: getSuccessMetadata({
                            queryUuid: queryResults.queryUuid,
                            queryCacheHit:
                                queryResults.cacheMetadata.cacheHit === true,
                            queryReuseHit:
                                queryResults.cacheMetadata.queryReuseHit ===
                                true,
                            artifact,
                            deferredSlack: !!deferSlackVisualization,
                        }),
                        structuredContent: {
                            outcome: 'results',
                            queryUuid: queryReference
                                ? queryResults.queryUuid
                                : null,
                            chartVersionUuid:
                                chartReference && artifact
                                    ? artifact.versionUuid
                                    : null,
                            chartExport: null,
                            truncationNote: null,
                            review: null,
                            presentationNote: null,
                            chartQualityNote: null,
                            sourceCoverageNote: null,
                            rowCount: queryResults.rows.length,
                            limit: {
                                requested:
                                    queryResults.rows.length >= effectiveLimit
                                        ? requestedLimit
                                        : null,
                                effective: effectiveLimit,
                                max:
                                    queryResults.rows.length >=
                                        effectiveLimit &&
                                    (requestedLimit === null ||
                                        requestedLimit > maxLimit)
                                        ? maxLimit
                                        : null,
                            },
                            parameters: appliedParameters,
                            data: null,
                        },
                    };
                }

                const csv = convertQueryResultsToCsv(
                    queryResults,
                    maxContextRows,
                );
                const shownRows = selectShownRows(
                    queryResults.rows,
                    maxContextRows,
                    queryResults.fields,
                );
                const truncationNote = getContextTruncationNote({
                    rowCount: queryResults.rows.length,
                    maxContextRows,
                });
                const sourceCoverageNote = decisions
                    ? joinedMeasureGuidance(
                          queryTool.queryConfig.metrics,
                          explore,
                          queryResults.rows,
                          ctx.getAvailableExplores(),
                      )
                    : '';
                const chartQualityNote = decisions
                    ? chartQualityHints(queryTool, queryResults.rows)
                    : '';
                return {
                    result: [
                        `${resultSummary}${truncationNote}${queryReference}${chartReference}${exportReference}${intentNote}${presentationNote}${sourceCoverageNote}${chartQualityNote}`,
                        serializeData(csv, 'csv'),
                    ].join('\n\n'),
                    metadata: getSuccessMetadata({
                        queryUuid: queryResults.queryUuid,
                        queryCacheHit:
                            queryResults.cacheMetadata.cacheHit === true,
                        queryReuseHit:
                            queryResults.cacheMetadata.queryReuseHit === true,
                        artifact,
                        deferredSlack: !!deferSlackVisualization,
                        fastResponse: fastAnswer
                            ? (getFastAnswerText(
                                  queryResults,
                                  presentation.config,
                              ) ?? undefined)
                            : undefined,
                    }),
                    structuredContent: {
                        outcome: 'results',
                        // Each note or id is carried exactly when the text states it.
                        queryUuid:
                            queryReference || (portableChart && !artifact)
                                ? queryResults.queryUuid
                                : null,
                        chartVersionUuid:
                            chartReference && artifact
                                ? artifact.versionUuid
                                : null,
                        chartExport:
                            portableChart && artifact
                                ? {
                                      artifactUuid: artifact.artifactUuid,
                                      versionUuid: artifact.versionUuid,
                                  }
                                : null,
                        truncationNote: truncationNote || null,
                        review: intentNote || null,
                        presentationNote: presentationNote || null,
                        chartQualityNote: chartQualityNote || null,
                        sourceCoverageNote: sourceCoverageNote || null,
                        rowCount: queryResults.rows.length,
                        limit: {
                            requested:
                                queryResults.rows.length >= effectiveLimit
                                    ? requestedLimit
                                    : null,
                            effective: effectiveLimit,
                            max:
                                queryResults.rows.length >= effectiveLimit &&
                                (requestedLimit === null ||
                                    requestedLimit > maxLimit)
                                    ? maxLimit
                                    : null,
                        },
                        parameters: appliedParameters,
                        data: shownRows,
                    },
                };
            } catch (e) {
                if (e instanceof AiAccessRefusedError) {
                    return toolErrorOutput(e, `Error running query.`);
                }
                const fieldAdvice =
                    decisions && e instanceof AiAgentUnknownFieldsError
                        ? await suggestSemanticFields({
                              decisions,
                              error: e,
                              question: question ?? '',
                          })
                        : '';
                const result =
                    toolErrorHandler(
                        decisions && e instanceof AiAgentUnknownFieldsError
                            ? new Error(
                                  `${e.conciseMessage}\nFull field inventory omitted. Use the suggested IDs below or grepFields/getMetadata for the missing definitions.`,
                              )
                            : e,
                        `Error running query.`,
                    ) + fieldAdvice;
                return {
                    result,
                    metadata: { status: 'error' },
                    structuredContent: { error: result },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
