import {
    AiAgentValidatorError,
    AiResultType,
    convertAiTableCalcsSchemaToTableCalcs,
    filterAggregationCustomMetrics,
    generateVisualizationFilterExpressionToolDefinition,
    generateVisualizationToolDefinition,
    getItemId,
    getReferencedExploreParameterDefinitions,
    getRunQueryAgentViewRejectingMerge,
    getRunQueryFilterExpressionAgentViewRejectingMerge,
    getSlackAiEchartsConfig,
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
    type SlackPrompt,
    type ToolRunQueryArgs,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryBuiltinChartConfig,
    type ToolRunQueryExpressionArgs,
    type ToolRunQueryExpressionResolvedArgs,
    type ToolRunQueryExpressionRuntimeArgs,
} from '@lightdash/common';
import { tool, type Schema } from 'ai';
import Logger from '../../../../logging/logger';
import type { AgentDecisionContext } from '../decisions/agentQuestion';
import type { AiDecisionClient } from '../decisions/AiDecisionClient';
import {
    getChartPresentationNote,
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
} from '../utils/convertQueryResultsToCsv';
import {
    formatFilterExpressionError,
    resolveFilterExpressionArgs,
} from '../utils/filterExpressions';
import { getPivotedResults } from '../utils/getPivotedResults';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../utils/populateCustomMetricsSQL';
import {
    getContextTruncationNote,
    getQueryResultSummary,
} from '../utils/queryResultSummary';
import { renderEcharts } from '../utils/renderEcharts';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
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

type Dependencies = {
    purpose?: 'visualization' | 'answer';
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

const CUSTOM_CHART_TYPE_IMAGE_BUDGET_MS = 60_000;
const CUSTOM_CHART_TYPE_IMAGE_ATTEMPTS = 2;

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

// One retry inside a total wall-clock budget. An image failure must never
// fail the answer — null means fall back to CSV.
const exportCustomChartTypeImageBounded = async (
    exportImage: () => Promise<Buffer>,
): Promise<Buffer | null> => {
    const deadline = Date.now() + CUSTOM_CHART_TYPE_IMAGE_BUDGET_MS;
    for (
        let attempt = 0;
        attempt < CUSTOM_CHART_TYPE_IMAGE_ATTEMPTS;
        attempt += 1
    ) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        let timer: NodeJS.Timeout | undefined;
        try {
            const attemptPromise = exportImage();
            // Swallow a late failure after the timeout wins the race.
            attemptPromise.catch(() => {});
            // eslint-disable-next-line no-await-in-loop
            return await Promise.race([
                attemptPromise,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    'Custom chart type image export timed out',
                                ),
                            ),
                        remainingMs,
                    );
                }),
            ]);
        } catch {
            // Retry, or fall through to the CSV fallback.
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
};

// Renders the chart as an image for Slack, or sends the results as a CSV for
// table visualizations. Returns the chart image URL when one was sent.
const sendSlackVisualization = async ({
    prompt,
    queryTool,
    queryResults,
    sendFile,
    exportImage,
    artifact,
    deferSlackVisualization,
}: {
    prompt: SlackPrompt;
    queryTool: ToolRunQueryArgsTransformed;
    queryResults: {
        queryUuid: string;
        rows: Record<string, unknown>[];
        fields: ItemsMap;
    };
    sendFile: SendFileFn;
    artifact: AiArtifact | undefined;
    deferSlackVisualization?: DeferSlackVisualizationFn;
    // Pre-bound export of the answer's artifact; null when no artifact
    // can be exported (merge branch).
    exportImage: (() => Promise<Buffer>) | null;
}): Promise<string | undefined> => {
    if (
        artifact &&
        deferSlackVisualization &&
        queryTool.chartConfig &&
        (isCustomChartTypeSlugChartConfig(queryTool.chartConfig) ||
            ['bar', 'horizontal', 'line', 'scatter', 'pie', 'funnel'].includes(
                queryTool.chartConfig.defaultVizType,
            ))
    ) {
        try {
            if (
                await deferSlackVisualization({
                    artifactUuid: artifact.artifactUuid,
                    versionUuid: artifact.versionUuid,
                    queryUuid: queryResults.queryUuid,
                    rowLimit: queryResults.rows.length,
                    queryTool,
                })
            )
                return undefined;
        } catch {
            Logger.warn(
                '[AiAgent] Deferred Slack image unavailable; using immediate delivery.',
            );
        }
    }
    const echartsOptions = await getSlackAiEchartsConfig({
        toolArgs: {
            type: AiResultType.QUERY_RESULT,
            tool: queryTool,
        },
        queryResults,
        getPivotedResults,
    });
    let chartImage: Buffer | null = null;
    if (echartsOptions) {
        chartImage = await renderEcharts(echartsOptions);
    } else if (
        isCustomChartTypeSlugChartConfig(queryTool.chartConfig) &&
        exportImage
    ) {
        chartImage = await exportCustomChartTypeImageBounded(exportImage);
    }
    if (chartImage) {
        return sendFile({
            channelId: prompt.slackChannelId,
            threadTs: prompt.slackThreadTs,
            organizationUuid: prompt.organizationUuid,
            title: queryTool.title || 'Generated by Lightdash',
            comment: queryTool.description || 'Chart generated by Lightdash',
            filename: 'lightdash-chart.png',
            file: chartImage,
        });
    }
    await sendFile({
        channelId: prompt.slackChannelId,
        threadTs: prompt.slackThreadTs,
        organizationUuid: prompt.organizationUuid,
        title: queryTool.title || 'Generated by Lightdash',
        comment: queryTool.description || 'Table generated by Lightdash',
        filename: 'lightdash-results.csv',
        file: Buffer.from(convertQueryResultsToCsv(queryResults), 'utf-8'),
    });
    return undefined;
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

export const getRunQuery = ({
    purpose = 'visualization',
    enableFastResponse = false,
    updateProgress,
    runAsyncQuery,
    getPrompt,
    sendFile,
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
    exportCustomChartTypeImage,
    decisions,
    question,
    conversation,
    presentationInstructions,
    allowPresentationCorrection,
    enableChartExport = false,
    searchFieldValues,
}: Dependencies) => {
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
        description = `${baseDescription} Use this when the user wants a data answer without a visualization. Set chartConfig to null. It returns query rows without creating a chart artifact in web chat; Slack also receives an explorable result card.`;
    } else if (decisions && enableDataAccess) {
        description = `${baseDescription} For builtin charts, you can set chartConfig to null: the server selects a validated default from the question and actual result shape. Supply chartConfig when explicit presentation settings are needed. Query fields, filters and limits are always your responsibility.`;
    }

    return tool({
        ...toolView,
        description,
        inputSchema,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                await updateProgress('Running your query...');

                const ctx = AgentContext.from(context);
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
                        return {
                            result:
                                formatFilterExpressionError(resolution.error) +
                                fieldAdvice,
                            metadata: { status: 'error' as const },
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
                        if (
                            purpose === 'answer' &&
                            !enableFastResponse &&
                            !isSlackPrompt(prompt)
                        )
                            return Promise.resolve(undefined);
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
                        await createMergeArtifactHook();
                        return {
                            result: 'Success',
                            metadata: { status: 'success' },
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
                        return {
                            result:
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
                                                  queryTool.queryConfig
                                                      .parameters,
                                          },
                                          review,
                                      })
                                    : NO_RESULTS_RETRY_PROMPT,
                            metadata: { status: 'success' },
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
                            : { config: null, advice: [] };
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

                    let chartImageUrl: string | undefined;
                    if (isSlackPrompt(prompt) && !slackLinksOnly) {
                        chartImageUrl = await sendSlackVisualization({
                            prompt,
                            queryTool,
                            queryResults,
                            sendFile,
                            // Merge × custom chart type is rejected above.
                            exportImage: null,
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
                    return {
                        result: enableDataAccess
                            ? [
                                  `${resultSummary}${getContextTruncationNote({
                                      rowCount: queryResults.rows.length,
                                      maxContextRows,
                                  })}${exportReference}${review}${presentationNote}${decisions ? chartQualityHints(queryTool, queryResults.rows) : ''}`,
                                  serializeData(csv, 'csv'),
                              ].join('\n\n')
                            : `Success. ${resultSummary}`,
                        metadata: getSuccessMetadata({
                            queryUuid: queryResults.queryUuid,
                            queryCacheHit:
                                queryResults.cacheMetadata.cacheHit === true,
                            queryReuseHit:
                                queryResults.cacheMetadata.queryReuseHit ===
                                true,
                            chartImageUrl,
                            artifact,
                            deferredSlack: !!deferSlackVisualization,
                            fastResponse:
                                enableFastResponse &&
                                purpose === 'answer' &&
                                enableDataAccess
                                    ? (convertQueryResultsToMarkdown(
                                          queryResults,
                                      ) ?? undefined)
                                    : undefined,
                        }),
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
                    if (
                        purpose === 'answer' &&
                        !enableFastResponse &&
                        !isSlackPrompt(prompt)
                    )
                        return Promise.resolve(undefined);
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
                    await createOrUpdateArtifactHook();
                    return {
                        result: `Success`,
                        metadata: { status: 'success' },
                    };
                }

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
                    return {
                        result:
                            (valueHints
                                ? `${EMPTY_QUERY_GUIDANCE} ${valueHints}${intentNote}`
                                : diagnosis) +
                            summarizeAppliedParameters(
                                explore,
                                projectParameterDefinitions,
                                queryTool.queryConfig.parameters,
                            ),
                        metadata: { status: 'success' },
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
                        : { config: null, advice: [] };
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

                let chartImageUrl: string | undefined;
                if (isSlackPrompt(prompt) && !slackLinksOnly) {
                    chartImageUrl = await sendSlackVisualization({
                        prompt,
                        queryTool,
                        queryResults,
                        sendFile,
                        exportImage: artifact
                            ? () => exportCustomChartTypeImage(artifact)
                            : null,
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

                // The queryUuid otherwise lives only in metadata, which never
                // reaches the model — leaving it unable to cite the execution
                // a report chart is evidence of.
                const queryReference = exposeQueryUuid
                    ? ` This execution's queryUuid is ${queryResults.queryUuid}; use exactly this value to reference it.`
                    : '';

                if (!enableDataAccess) {
                    return {
                        result: `Success. ${resultSummary}${queryReference}`,
                        metadata: getSuccessMetadata({
                            queryUuid: queryResults.queryUuid,
                            queryCacheHit:
                                queryResults.cacheMetadata.cacheHit === true,
                            queryReuseHit:
                                queryResults.cacheMetadata.queryReuseHit ===
                                true,
                            chartImageUrl,
                            artifact,
                            deferredSlack: !!deferSlackVisualization,
                        }),
                    };
                }

                const csv = convertQueryResultsToCsv(
                    queryResults,
                    maxContextRows,
                );
                return {
                    result: [
                        `${resultSummary}${getContextTruncationNote({
                            rowCount: queryResults.rows.length,
                            maxContextRows,
                        })}${queryReference}${exportReference}${intentNote}${presentationNote}${decisions ? joinedMeasureGuidance(queryTool.queryConfig.metrics, explore, queryResults.rows, ctx.getAvailableExplores()) + chartQualityHints(queryTool, queryResults.rows) : ''}`,
                        serializeData(csv, 'csv'),
                    ].join('\n\n'),
                    metadata: getSuccessMetadata({
                        queryUuid: queryResults.queryUuid,
                        queryCacheHit:
                            queryResults.cacheMetadata.cacheHit === true,
                        queryReuseHit:
                            queryResults.cacheMetadata.queryReuseHit === true,
                        chartImageUrl,
                        artifact,
                        deferredSlack: !!deferSlackVisualization,
                        fastResponse:
                            enableFastResponse && purpose === 'answer'
                                ? (convertQueryResultsToMarkdown(
                                      queryResults,
                                  ) ?? undefined)
                                : undefined,
                    }),
                };
            } catch (e) {
                const fieldAdvice =
                    decisions && e instanceof AiAgentUnknownFieldsError
                        ? await suggestSemanticFields({
                              decisions,
                              error: e,
                              question: question ?? '',
                          })
                        : '';
                return {
                    result:
                        toolErrorHandler(
                            decisions && e instanceof AiAgentUnknownFieldsError
                                ? new Error(
                                      `${e.conciseMessage}\nFull field inventory omitted. Use the suggested IDs below or grepFields/getMetadata for the missing definitions.`,
                                  )
                                : e,
                            `Error running query.`,
                        ) + fieldAdvice,
                    metadata: { status: 'error' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
};
