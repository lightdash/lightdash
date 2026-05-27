import {
    getValidAiQueryLimit,
    toolRunSavedChartArgsSchema,
    toolRunSavedChartOutputSchema,
    toolRunSavedChartV2ArgsSchema,
    toolRunSavedChartV2OutputSchema,
    type AiMetricQueryWithFilters,
    type MetricQuery,
} from '@lightdash/common';
import { tool } from 'ai';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    getSavedChart: GetSavedChartFn;
    maxLimit: number;
    enableDataAccess: boolean;
};

type V2Dependencies = Omit<Dependencies, 'runAsyncQuery' | 'maxLimit'> & {
    runSavedChartQuery: RunSavedChartQueryFn;
};

/**
 * Builds a structural summary the LLM can read to understand what the saved
 * chart is querying. When `includeFullSpec` is false (data access disabled
 * mode), only field IDs are surfaced — filter values and sort/limit details
 * are omitted to keep filter values out of the LLM context.
 */
const buildHeader = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
    { includeFullSpec }: { includeFullSpec: boolean },
) => {
    const lines = [
        `Chart: "${name}" (chartUuid: ${chartUuid})`,
        `Explore: ${metricQuery.exploreName}`,
        `Dimensions: ${metricQuery.dimensions.join(', ') || '(none)'}`,
        `Metrics: ${metricQuery.metrics.join(', ') || '(none)'}`,
    ];

    if (includeFullSpec) {
        lines.push(`Filters: ${JSON.stringify(metricQuery.filters)}`);
        if (metricQuery.sorts.length > 0) {
            lines.push(`Sorts: ${JSON.stringify(metricQuery.sorts)}`);
        }
        lines.push(`Limit: ${metricQuery.limit}`);
        if (
            metricQuery.tableCalculations &&
            metricQuery.tableCalculations.length > 0
        ) {
            lines.push(
                `Table calculations: ${metricQuery.tableCalculations
                    .map((c) => c.name)
                    .join(', ')}`,
            );
        }
        if (
            metricQuery.additionalMetrics &&
            metricQuery.additionalMetrics.length > 0
        ) {
            lines.push(
                `Custom metrics: ${metricQuery.additionalMetrics
                    .map((m) => `${m.table}_${m.name}`)
                    .join(', ')}`,
            );
        }
        if (
            metricQuery.customDimensions &&
            metricQuery.customDimensions.length > 0
        ) {
            lines.push(
                `Custom dimensions: ${metricQuery.customDimensions
                    .map((d) => d.id)
                    .join(', ')}`,
            );
        }
    }

    lines.push('', '');
    return lines.join('\n');
};

export const getRunSavedChart = ({
    updateProgress,
    runAsyncQuery,
    getSavedChart,
    maxLimit,
    enableDataAccess,
}: Dependencies) =>
    tool({
        description: toolRunSavedChartArgsSchema.description,
        inputSchema: toolRunSavedChartArgsSchema,
        outputSchema: toolRunSavedChartOutputSchema,
        execute: async ({ chartUuid }) => {
            try {
                await updateProgress('Running saved chart...');

                const savedChart = await getSavedChart(chartUuid);
                const { metricQuery, name } = savedChart;

                if (!enableDataAccess) {
                    return {
                        result: `${buildHeader(chartUuid, name, metricQuery, {
                            includeFullSpec: false,
                        })}Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.`,
                        metadata: { status: 'success' },
                    };
                }

                const aiMetricQuery: AiMetricQueryWithFilters = {
                    exploreName: metricQuery.exploreName,
                    dimensions: metricQuery.dimensions,
                    metrics: metricQuery.metrics,
                    sorts: metricQuery.sorts,
                    limit: getValidAiQueryLimit(metricQuery.limit, maxLimit),
                    tableCalculations: metricQuery.tableCalculations,
                    additionalMetrics: metricQuery.additionalMetrics ?? [],
                    filters: metricQuery.filters,
                };

                const queryResults = await runAsyncQuery(aiMetricQuery);

                if (queryResults.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: { status: 'success' },
                    };
                }

                const csv = convertQueryResultsToCsv(queryResults);
                return {
                    result: `${buildHeader(chartUuid, name, metricQuery, {
                        includeFullSpec: true,
                    })}${serializeData(csv, 'csv')}`,
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error running saved chart.'),
                    metadata: { status: 'error' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

export const getRunSavedChartV2 = ({
    updateProgress,
    runSavedChartQuery,
    getSavedChart,
    enableDataAccess,
}: V2Dependencies) =>
    tool({
        description: toolRunSavedChartV2ArgsSchema.description,
        inputSchema: toolRunSavedChartV2ArgsSchema,
        outputSchema: toolRunSavedChartV2OutputSchema,
        execute: async ({ chartSlug, dashboardSlug, limit }) => {
            try {
                await updateProgress('Running saved chart...');

                const savedChart = await getSavedChart(chartSlug);
                const { metricQuery, name, uuid } = savedChart;

                if (!enableDataAccess) {
                    return {
                        result: `${buildHeader(uuid, name, metricQuery, {
                            includeFullSpec: false,
                        })}Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.`,
                        metadata: { status: 'success' },
                    };
                }

                const queryResults = await runSavedChartQuery({
                    chartUuid: uuid,
                    dashboardSlug,
                    limit,
                });

                if (queryResults.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: { status: 'success' },
                    };
                }

                const csv = convertQueryResultsToCsv(queryResults);
                return {
                    result: `${buildHeader(uuid, name, metricQuery, {
                        includeFullSpec: true,
                    })}${serializeData(csv, 'csv')}`,
                    metadata: { status: 'success' },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error running saved chart.'),
                    metadata: { status: 'error' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
