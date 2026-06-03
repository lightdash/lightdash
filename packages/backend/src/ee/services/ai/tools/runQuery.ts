import {
    AiResultType,
    convertAiTableCalcsSchemaToTableCalcs,
    filterAggregationCustomMetrics,
    getSlackAiEchartsConfig,
    getValidAiQueryLimit,
    isSlackPrompt,
    runQueryToolDefinition,
    toolRunQueryArgsSchemaTransformed,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/ai';
import {
    AiAgentValidatorError,
    getTotalFilterRules,
    type Explore,
} from '@lightdash/common';
import { tool } from 'ai';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    RunAsyncQueryFn,
    SendFileFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { getPivotedResults } from '../utils/getPivotedResults';
import {
    expandMetricsWithPopAdditionalMetrics,
    populateCustomMetricsSQL,
} from '../utils/populateCustomMetricsSQL';
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
    enableDataAccess: boolean;
    enableSelfImprovement: boolean;
};

const toolDefinition = runQueryToolDefinition.for('agent');

export const validateRunQueryTool = (
    queryTool: ToolRunQueryArgsTransformed,
    explore: Explore,
) => {
    const filterRules = getTotalFilterRules(queryTool.filters);

    const {
        queryConfig: { dimensions, metrics },
        customMetrics,
        tableCalculations,
    } = queryTool;

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
        queryTool.tableCalculations,
    );
    validateMetricDimensionFilterPlacement(
        explore,
        aggregations,
        queryTool.tableCalculations,
        queryTool.filters,
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
        queryTool.tableCalculations,
    );

    // Validate sort fields exist
    validateSelectedFieldsExistence(
        explore,
        queryTool.queryConfig.sorts.map((sort) => sort.fieldId),
        aggregations,
        queryTool.tableCalculations,
    );

    validateSortFieldsAreSelected(
        queryTool.queryConfig.sorts,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        aggregations,
        queryTool.tableCalculations,
    );

    // Validate table calculations
    validateTableCalculations(
        explore,
        queryTool.tableCalculations,
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

export const getRunQuery = ({
    updateProgress,
    runAsyncQuery,
    getPrompt,
    sendFile,
    createOrUpdateArtifact,
    maxLimit,
    enableDataAccess,
    enableSelfImprovement,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                await updateProgress('Running your query...');

                const queryTool =
                    toolRunQueryArgsSchemaTransformed.parse(toolArgs);
                const ctx = AgentContext.from(context);
                const explore = ctx.getExplore(
                    queryTool.queryConfig.exploreName,
                );

                validateRunQueryTool(queryTool, explore);

                const prompt = await getPrompt();

                const aggregationCustomMetrics = filterAggregationCustomMetrics(
                    queryTool.customMetrics,
                );

                const populatedCustomMetrics = populateCustomMetricsSQL(
                    queryTool.customMetrics,
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
                        vizConfig: expandedToolArgs,
                    });

                const selfImprovementResultFollowUp =
                    enableSelfImprovement && aggregationCustomMetrics.length > 0
                        ? `\nCan you propose the creation of this metric as a metric to the semantic layer to the user?`
                        : '';

                // Early artifact creation for non-data-access mode
                if (!enableDataAccess && !isSlackPrompt(prompt)) {
                    await createOrUpdateArtifactHook();
                    return {
                        result: `Success`,
                        metadata: { status: 'success' },
                    };
                }

                const metricQuery = {
                    exploreName: queryTool.queryConfig.exploreName,
                    dimensions: queryTool.queryConfig.dimensions,
                    metrics: expandedMetrics,
                    sorts: queryTool.queryConfig.sorts.map((sort) => ({
                        ...sort,
                        nullsFirst: sort.nullsFirst ?? undefined,
                    })),
                    limit: getValidAiQueryLimit(
                        queryTool.queryConfig.limit,
                        maxLimit,
                    ),
                    filters: queryTool.filters,
                    additionalMetrics: populatedCustomMetrics,
                    tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                        queryTool.tableCalculations,
                    ),
                };

                const queryResults = await runAsyncQuery(
                    metricQuery,
                    populatedCustomMetrics,
                );

                if (queryResults.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: { status: 'success' },
                    };
                }

                await createOrUpdateArtifactHook();

                // Render chart as image for Slack, or send CSV for tables
                if (isSlackPrompt(prompt)) {
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
                        await sendFile({
                            channelId: prompt.slackChannelId,
                            threadTs: prompt.slackThreadTs,
                            organizationUuid: prompt.organizationUuid,
                            title: toolArgs.title || 'Generated by Lightdash',
                            comment:
                                toolArgs.description ||
                                'Chart generated by Lightdash',
                            filename: 'lightdash-chart.png',
                            file: chartImage,
                        });
                    } else {
                        // Table visualization - send CSV file
                        const csvData = convertQueryResultsToCsv(queryResults);
                        await sendFile({
                            channelId: prompt.slackChannelId,
                            threadTs: prompt.slackThreadTs,
                            organizationUuid: prompt.organizationUuid,
                            title: toolArgs.title || 'Generated by Lightdash',
                            comment:
                                toolArgs.description ||
                                'Table generated by Lightdash',
                            filename: 'lightdash-results.csv',
                            file: Buffer.from(csvData, 'utf-8'),
                        });
                    }
                }

                if (!enableDataAccess) {
                    return {
                        result: `Success. ${selfImprovementResultFollowUp}`,
                        metadata: { status: 'success' },
                    };
                }

                const csv = convertQueryResultsToCsv(queryResults);
                return {
                    result: `${serializeData(
                        csv,
                        'csv',
                    )} ${selfImprovementResultFollowUp}`,
                    metadata: { status: 'success' },
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
