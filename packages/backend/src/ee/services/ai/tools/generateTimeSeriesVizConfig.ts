import {
    convertAiTableCalcsSchemaToTableCalcs,
    isSlackPrompt,
    metricQueryTimeSeriesViz,
    toolTimeSeriesArgsSchema,
    toolTimeSeriesArgsSchemaTransformed,
    toolTimeSeriesOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    CreateOrUpdateArtifactFn,
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SendFileFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { populateCustomMetricsSQL } from '../utils/populateCustomMetricsSQL';
import { renderEcharts } from '../utils/renderEcharts';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateTimeSeriesVizConfig } from '../utils/validateTimeSeriesVizConfig';
import { renderTimeSeriesViz } from '../visualizations/vizTimeSeries';

type Dependencies = {
    getExplore: GetExploreFn;
    updateProgress: UpdateProgressFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    sendFile: SendFileFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxLimit: number;
    enableDataAccess: boolean;
    enableSelfImprovement: boolean;
};

export const getGenerateTimeSeriesVizConfig = ({
    getExplore,
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
        description: toolTimeSeriesArgsSchema.description,
        inputSchema: toolTimeSeriesArgsSchema,
        outputSchema: toolTimeSeriesOutputSchema,
        execute: async (toolArgs) => {
            try {
                await updateProgress('📈 Generating your line chart...');

                // TODO: common for all viz tools. find a way to reuse this code.
                const vizTool =
                    toolTimeSeriesArgsSchemaTransformed.parse(toolArgs);
                const explore = await getExplore({
                    exploreName: vizTool.vizConfig.exploreName,
                });
                validateTimeSeriesVizConfig(vizTool, explore);
                // end of TODO

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
                    toolArgs.customMetrics &&
                    toolArgs.customMetrics.length > 0
                        ? `\nCan you propose the creation of this metric as a metric to the semantic layer to the user?`
                        : '';

                if (!enableDataAccess && !isSlackPrompt(prompt)) {
                    await createOrUpdateArtifactHook();

                    return {
                        result: `Success`,
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                const metricQuery = metricQueryTimeSeriesViz({
                    vizConfig: vizTool.vizConfig,
                    filters: vizTool.filters,
                    maxLimit,
                    customMetrics: vizTool.customMetrics ?? null,
                    tableCalculations: convertAiTableCalcsSchemaToTableCalcs(
                        vizTool.tableCalculations,
                    ),
                });

                const queryResults = await runMiniMetricQuery(
                    metricQuery,
                    maxLimit,
                    populateCustomMetricsSQL(vizTool.customMetrics, explore),
                );

                if (queryResults.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                await createOrUpdateArtifactHook();

                if (isSlackPrompt(prompt)) {
                    const { chartOptions } = await renderTimeSeriesViz({
                        queryResults,
                        vizTool,
                        metricQuery,
                    });

                    const file = await renderEcharts(chartOptions);
                    await updateProgress('✅ Done.');

                    const sentfileArgs = {
                        channelId: prompt.slackChannelId,
                        threadTs: prompt.slackThreadTs,
                        organizationUuid: prompt.organizationUuid,
                        title: 'Generated by Lightdash',
                        comment: `Line chart generated by Lightdash`,
                        filename: 'lightdash-query-results.png',
                        file,
                    };
                    await sendFile(sentfileArgs);
                }

                if (!enableDataAccess) {
                    return {
                        result: `Success. ${selfImprovementResultFollowUp}`,
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                const csv = convertQueryResultsToCsv(queryResults);

                return {
                    result: `${serializeData(
                        csv,
                        'csv',
                    )} ${selfImprovementResultFollowUp}`,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, `Error generating line chart.`),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
