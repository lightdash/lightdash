import {
    AiResultType,
    convertAiTableCalcsSchemaToTableCalcs,
    getSlackAiEchartsConfig,
    getTotalFilterRules,
    getValidAiQueryLimit,
    isSlackPrompt,
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
    toolRunQueryOutputSchema,
    type Explore,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SendFileFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { getPivotedResults } from '../utils/getPivotedResults';
import { populateCustomMetricsSQL } from '../utils/populateCustomMetricsSQL';
import { renderEcharts } from '../utils/renderEcharts';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import {
    validateAxisFields,
    validateCustomMetricsDefinition,
    validateFieldEntityType,
    validateFilterRules,
    validateGroupByFields,
    validateMetricDimensionFilterPlacement,
    validateSelectedFieldsExistence,
    validateSortFieldsAreSelected,
    validateTableCalculations,
} from '../utils/validators';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxLimit: number;
    enableDataAccess: boolean;
    enableSelfImprovement: boolean;
};

export const validateRunQueryTool = (
    queryTool: ToolRunQueryArgsTransformed,
    explore: Explore,
) => {
    const filterRules = getTotalFilterRules(queryTool.filters);

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
        queryTool.customMetrics,
    );

    validateCustomMetricsDefinition(explore, queryTool.customMetrics);
    validateFilterRules(
        explore,
        filterRules,
        queryTool.customMetrics,
        queryTool.tableCalculations,
    );
    validateMetricDimensionFilterPlacement(
        explore,
        queryTool.customMetrics,
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
        queryTool.customMetrics,
        queryTool.tableCalculations,
    );

    validateSortFieldsAreSelected(
        queryTool.queryConfig.sorts,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        queryTool.customMetrics,
        queryTool.tableCalculations,
    );

    // Validate table calculations
    validateTableCalculations(
        explore,
        queryTool.tableCalculations,
        queryTool.queryConfig.dimensions,
        queryTool.queryConfig.metrics,
        queryTool.customMetrics,
    );
};

export const getRunQuery = ({
    updateProgress,
    runMiniMetricQuery,
    getPrompt,
    sendFile,
    createOrUpdateArtifact,
    maxLimit,
    enableDataAccess,
    enableSelfImprovement,
}: Dependencies) =>
    tool({
        description: toolRunQueryArgsSchema.description,
        inputSchema: toolRunQueryArgsSchema,
        outputSchema: toolRunQueryOutputSchema,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                await updateProgress('📊 Running your query...');

                const queryTool =
                    toolRunQueryArgsSchemaTransformed.parse(toolArgs);
                const ctx = AgentContext.from(context);
                const explore = ctx.getExplore(
                    queryTool.queryConfig.exploreName,
                );

                validateRunQueryTool(queryTool, explore);

                const prompt = await getPrompt();

                const createOrUpdateArtifactHook = () =>
                    createOrUpdateArtifact({
                        threadUuid: prompt.threadUuid,
                        promptUuid: prompt.promptUuid,
                        artifactType: 'chart',
                        title: toolArgs.title,
                        description: toolArgs.description,
                        vizConfig: toolArgs,
                    });

                const selfImprovementResultFollowUp =
                    enableSelfImprovement &&
                    queryTool.customMetrics &&
                    queryTool.customMetrics.length > 0
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

                // Execute query
                const metricQuery = {
                    exploreName: queryTool.queryConfig.exploreName,
                    dimensions: queryTool.queryConfig.dimensions,
                    metrics: queryTool.queryConfig.metrics,
                    sorts: queryTool.queryConfig.sorts.map((sort) => ({
                        ...sort,
                        nullsFirst: sort.nullsFirst ?? undefined,
                    })),
                    limit: getValidAiQueryLimit(
                        queryTool.queryConfig.limit,
                        maxLimit,
                    ),
                    filters: queryTool.filters,
                    additionalMetrics: queryTool.customMetrics ?? [],
                    tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                        queryTool.tableCalculations,
                    ),
                };

                const queryResults = await runMiniMetricQuery(
                    metricQuery,
                    maxLimit,
                    populateCustomMetricsSQL(queryTool.customMetrics, explore),
                );

                if (queryResults.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: { status: 'success' },
                    };
                }

                await createOrUpdateArtifactHook();

                // Render chart as image for Slack
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
        toModelOutput: (output) => toModelOutput(output),
    });
