import {
    buildChartAsCodeArtifact,
    ChartType,
    normalizeChartAsCodeMetricQuery,
    runContentQueryToolDefinition,
    type ChartAsCodeMetricQueryInput,
    type ParametersValuesMap,
} from '@lightdash/common';
import { tool } from 'ai';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    UpdateProgressFn,
    ValidateContentFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { serializeData } from '../utils/serializeData';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { buildSavedChartHeader } from './runSavedChart';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    getSavedChart: GetSavedChartFn;
    validateContent: ValidateContentFn;
    maxLimit: number;
    enableDataAccess: boolean;
};

const toolDefinition = runContentQueryToolDefinition.for('agent');

export const getRunContentQuery = ({
    updateProgress,
    runAsyncQuery,
    runSavedChartQuery,
    getSavedChart,
    validateContent,
    maxLimit,
    enableDataAccess,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ source }) => {
            try {
                await updateProgress('Running content query...');

                if (
                    source.type === 'chart' ||
                    source.type === 'dashboardChart'
                ) {
                    const savedChart = await getSavedChart(source.chartSlug);
                    const { metricQuery, name, uuid } = savedChart;

                    if (!enableDataAccess) {
                        return {
                            result: `${buildSavedChartHeader(
                                uuid,
                                name,
                                metricQuery,
                                {
                                    includeFullSpec: false,
                                },
                            )}Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.`,
                            metadata: { status: 'success' as const },
                        };
                    }

                    const queryResults = await runSavedChartQuery({
                        chartUuid: uuid,
                        dashboardSlug:
                            source.type === 'dashboardChart'
                                ? source.dashboardSlug
                                : null,
                        limit: source.limit,
                    });

                    if (queryResults.rows.length === 0) {
                        return {
                            result: NO_RESULTS_RETRY_PROMPT,
                            metadata: { status: 'success' as const },
                        };
                    }

                    const csv = convertQueryResultsToCsv(queryResults);
                    return {
                        result: `${buildSavedChartHeader(
                            uuid,
                            name,
                            metricQuery,
                            {
                                includeFullSpec: true,
                            },
                        )}${serializeData(csv, 'csv')}`,
                        metadata: { status: 'success' as const },
                    };
                }

                const metricQuery = normalizeChartAsCodeMetricQuery(
                    source.tableName,
                    source.metricQuery as ChartAsCodeMetricQueryInput,
                    maxLimit,
                );

                validateContent({
                    type: 'chart',
                    content: {
                        ...buildChartAsCodeArtifact({
                            name: 'Query',
                            tableName: source.tableName,
                            metricQuery:
                                source.metricQuery as ChartAsCodeMetricQueryInput,
                            chartConfig: {
                                type: ChartType.TABLE,
                                config: {},
                            },
                            maxLimit,
                        }),
                        parameters: source.parameters as
                            | ParametersValuesMap
                            | undefined,
                    },
                });

                if (!enableDataAccess) {
                    return {
                        result: 'Data access is disabled for this agent. The metric query shape is valid, but row values cannot be returned.',
                        metadata: { status: 'success' as const },
                    };
                }

                const queryResults = await runAsyncQuery(
                    metricQuery,
                    undefined,
                    source.parameters
                        ? (source.parameters as ParametersValuesMap)
                        : undefined,
                );

                if (queryResults.rows.length === 0) {
                    return {
                        result: NO_RESULTS_RETRY_PROMPT,
                        metadata: { status: 'success' as const },
                    };
                }

                return {
                    result: serializeData(
                        convertQueryResultsToCsv(queryResults),
                        'csv',
                    ),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        'Error running content query.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
