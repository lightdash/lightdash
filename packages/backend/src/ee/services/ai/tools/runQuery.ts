import {
    AiAgentValidatorError,
    AiResultType,
    convertAiTableCalcsSchemaToTableCalcs,
    filterAggregationCustomMetrics,
    generateVisualizationToolDefinition,
    getItemId,
    getReferencedExploreParameterDefinitions,
    getRunQueryAgentViewRejectingMerge,
    getSlackAiEchartsConfig,
    getTotalFilterRules,
    getValidAiQueryLimit,
    isMergeMetricSource,
    isSlackPrompt,
    MERGE_TABLE_NAME,
    toolRunQueryArgsSchemaTransformed,
    type Explore,
    type ItemsMap,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SlackPrompt,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    RunAsyncMergeQueryFn,
    RunAsyncQueryFn,
    SendFileFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import {
    buildAiMergeQuery,
    buildAiMergeSourceConfigs,
} from '../utils/buildAiMergeQuery';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
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

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxLimit: number;
    maxContextRows: number;
    /** Deep Research report charts must cite the execution they came from. */
    exposeQueryUuid: boolean;
    enableDataAccess: boolean;
    // Project-level parameter definitions; model-level ones come from the explore.
    projectParameterDefinitions: ParameterDefinitions;
    enableMergeQueries: boolean;
    runAsyncMergeQuery: RunAsyncMergeQueryFn;
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

    // Validate groupBy fields
    validateGroupByFields(
        explore,
        queryTool.chartConfig?.groupBy,
        queryTool.queryConfig.dimensions,
    );

    // Validate axis fields
    validateAxisFields(
        queryTool.chartConfig,
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

// Renders the chart as an image for Slack, or sends the results as a CSV for
// table visualizations. Returns the chart image URL when one was sent.
const sendSlackVisualization = async ({
    prompt,
    queryTool,
    queryResults,
    sendFile,
}: {
    prompt: SlackPrompt;
    queryTool: ToolRunQueryArgsTransformed;
    queryResults: { rows: Record<string, unknown>[]; fields: ItemsMap };
    sendFile: SendFileFn;
}): Promise<string | undefined> => {
    const echartsOptions = await getSlackAiEchartsConfig({
        toolArgs: {
            type: AiResultType.QUERY_RESULT,
            tool: queryTool,
        },
        queryResults,
        getPivotedResults,
    });
    if (echartsOptions) {
        const chartImage = await renderEcharts(echartsOptions);
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

export const getRunQuery = ({
    updateProgress,
    runAsyncQuery,
    getPrompt,
    sendFile,
    createOrUpdateArtifact,
    maxLimit,
    maxContextRows,
    exposeQueryUuid,
    enableDataAccess,
    projectParameterDefinitions,
    enableMergeQueries,
    runAsyncMergeQuery,
}: Dependencies) =>
    tool({
        ...(enableMergeQueries
            ? generateVisualizationToolDefinition.for('agent')
            : getRunQueryAgentViewRejectingMerge()),
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                await updateProgress('Running your query...');

                const queryTool =
                    toolRunQueryArgsSchemaTransformed.parse(toolArgs);
                const ctx = AgentContext.from(context);
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

                    if (queryTool.chartConfig) {
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

                    const createMergeArtifactHook = () =>
                        createOrUpdateArtifact({
                            threadUuid: prompt.threadUuid,
                            promptUuid: prompt.promptUuid,
                            artifactType: 'chart',
                            title: toolArgs.title,
                            description: toolArgs.description,
                            vizConfig: {
                                source: 'merge',
                                schemaVersion: 1,
                                config: toolArgs,
                            },
                        });

                    if (!enableDataAccess && !isSlackPrompt(prompt)) {
                        await createMergeArtifactHook();
                        return {
                            result: 'Success',
                            metadata: { status: 'success' },
                        };
                    }

                    const queryResults = await runAsyncMergeQuery(
                        mergeQuery,
                        queryTool.queryConfig.parameters ?? undefined,
                    );

                    if (queryResults.rows.length === 0) {
                        return {
                            result: NO_RESULTS_RETRY_PROMPT,
                            metadata: { status: 'success' },
                        };
                    }

                    await createMergeArtifactHook();

                    let chartImageUrl: string | undefined;
                    if (isSlackPrompt(prompt)) {
                        chartImageUrl = await sendSlackVisualization({
                            prompt,
                            queryTool,
                            queryResults,
                            sendFile,
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
                                  })}`,
                                  serializeData(csv, 'csv'),
                              ].join('\n\n')
                            : `Success. ${resultSummary}`,
                        metadata: {
                            status: 'success',
                            chartImageUrl,
                            queryUuid: queryResults.queryUuid,
                        },
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
                const expandedToolArgs =
                    expandedMetrics.length >
                        queryTool.queryConfig.metrics.length &&
                    toolArgs.chartConfig
                        ? {
                              ...toolArgs,
                              chartConfig: {
                                  ...toolArgs.chartConfig,
                                  yAxisMetrics:
                                      expandMetricsWithPopAdditionalMetrics(
                                          toolArgs.chartConfig.yAxisMetrics,
                                          populatedCustomMetrics,
                                      ),
                              },
                          }
                        : toolArgs;

                const createOrUpdateArtifactHook = () =>
                    createOrUpdateArtifact({
                        threadUuid: prompt.threadUuid,
                        promptUuid: prompt.promptUuid,
                        artifactType: 'chart',
                        title: toolArgs.title,
                        description: toolArgs.description,
                        vizConfig: {
                            source: 'semantic',
                            config: expandedToolArgs,
                        },
                    });

                // Early artifact creation for non-data-access mode
                if (!enableDataAccess && !isSlackPrompt(prompt)) {
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

                const queryResults = await runAsyncQuery(
                    metricQuery,
                    populatedCustomMetrics,
                    queryTool.queryConfig.parameters ?? undefined,
                );

                if (queryResults.rows.length === 0) {
                    // A wrong parameter state is a common cause of empty
                    // results — surface what the query actually ran with.
                    return {
                        result:
                            NO_RESULTS_RETRY_PROMPT +
                            summarizeAppliedParameters(
                                explore,
                                projectParameterDefinitions,
                                queryTool.queryConfig.parameters,
                            ),
                        metadata: { status: 'success' },
                    };
                }

                await createOrUpdateArtifactHook();

                let chartImageUrl: string | undefined;
                if (isSlackPrompt(prompt)) {
                    chartImageUrl = await sendSlackVisualization({
                        prompt,
                        queryTool,
                        queryResults,
                        sendFile,
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
                        metadata: {
                            status: 'success',
                            chartImageUrl,
                            queryUuid: queryResults.queryUuid,
                        },
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
                        })}${queryReference}`,
                        serializeData(csv, 'csv'),
                    ].join('\n\n'),
                    metadata: {
                        status: 'success',
                        chartImageUrl,
                        queryUuid: queryResults.queryUuid,
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, `Error running query.`),
                    metadata: { status: 'error' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
