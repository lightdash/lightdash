import {
    getItemLabelWithoutTableName,
    getValidAiQueryLimit,
    runContentQueryToolDefinition,
    type AiMetricQueryWithFilters,
    type ChartAsCode,
    type Filters,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type ToolRunContentQueryStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { type QueryReviewer } from '../decisions/queryReview';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
    RunSavedChartQueryFn,
    UpdateProgressFn,
    ValidateContentFn,
} from '../types/aiAgentDependencies';
import { convertQueryResultsToCsv } from '../utils/convertQueryResultsToCsv';
import { getContextTruncationNote } from '../utils/queryResultSummary';
import { serializeData } from '../utils/serializeData';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { buildSavedChartHeader } from './runSavedChart';

type Dependencies = {
    reviewQuery?: QueryReviewer;
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    runSavedChartQuery: RunSavedChartQueryFn;
    getSavedChart: GetSavedChartFn;
    validateContent: ValidateContentFn;
    maxLimit: number;
    maxContextRows: number;
    enableDataAccess: boolean;
};

const toolDefinition = runContentQueryToolDefinition.for('agent');

type RunContentQueryResult =
    | ExecuteStructuredToolResult<ToolRunContentQueryStructuredContent>
    | ExecuteToolErrorResult;

type RowsOutcome = Extract<
    ToolRunContentQueryStructuredContent,
    { outcome: 'rows' }
>;

const describeSavedChartStructure = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
) => ({
    chartUuid,
    name,
    exploreName: metricQuery.exploreName,
    dimensions: metricQuery.dimensions,
    metrics: metricQuery.metrics,
});

// Mirrors the full-spec header rendered by buildSavedChartHeader.
const describeSavedChartSpec = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
): RowsOutcome['chart'] => ({
    ...describeSavedChartStructure(chartUuid, name, metricQuery),
    filters: metricQuery.filters,
    sorts: metricQuery.sorts.map(({ fieldId, descending }) => ({
        fieldId,
        descending,
    })),
    limit: metricQuery.limit,
    tableCalculations: (metricQuery.tableCalculations ?? []).map(
        (calculation) => calculation.name,
    ),
    customMetrics: (metricQuery.additionalMetrics ?? []).map(
        (metric) => `${metric.table}_${metric.name}`,
    ),
    customDimensions: (metricQuery.customDimensions ?? []).map(
        (dimension) => dimension.id,
    ),
});

// The rows the model sees, and the columns as the CSV header labels them.
const buildShownTable = (
    queryResults: { rows: Record<string, unknown>[]; fields: ItemsMap },
    maxContextRows: number,
): Omit<RowsOutcome, 'outcome' | 'chart'> => {
    const fieldIds = queryResults.rows[0]
        ? Object.keys(queryResults.rows[0])
        : [];
    const rows = queryResults.rows.slice(0, maxContextRows);
    return {
        rowCount: queryResults.rows.length,
        shownRowCount: rows.length,
        columns: fieldIds.map((fieldId) => {
            const item = queryResults.fields[fieldId];
            return {
                fieldId,
                label: item ? getItemLabelWithoutTableName(item) : fieldId,
            };
        }),
        rows,
    };
};

export const getRunContentQuery = ({
    reviewQuery,
    updateProgress,
    runAsyncQuery,
    runSavedChartQuery,
    getSavedChart,
    validateContent,
    maxLimit,
    maxContextRows,
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
                            metadata: {
                                status: 'success' as const,
                            },
                            structuredContent: {
                                outcome: 'dataAccessDisabled',
                                chart: describeSavedChartStructure(
                                    uuid,
                                    name,
                                    metricQuery,
                                ),
                            },
                        };
                    }

                    let pendingReview: Promise<string> | null = null;
                    const queryResults = await runSavedChartQuery({
                        chartUuid: uuid,
                        dashboardSlug:
                            source.type === 'dashboardChart'
                                ? source.dashboardSlug
                                : null,
                        limit: source.limit,
                        ...(reviewQuery
                            ? {
                                  onQueryPrepared: (execution) => {
                                      pendingReview = reviewQuery({
                                          kind: 'semantic',
                                          query: execution.metricQuery,
                                          parameters:
                                              execution.usedParametersValues,
                                          timezone: execution.resolvedTimezone,
                                      });
                                  },
                              }
                            : {}),
                    });
                    const review =
                        (await (pendingReview ??
                            reviewQuery?.({
                                kind: 'semantic',
                                query: queryResults.execution.metricQuery,
                                parameters:
                                    queryResults.execution.usedParametersValues,
                                timezone:
                                    queryResults.execution.resolvedTimezone,
                            }))) ?? '';

                    if (queryResults.rows.length === 0) {
                        return {
                            result: reviewQuery
                                ? await reviewQuery(
                                      {
                                          kind: 'semantic',
                                          query: queryResults.execution
                                              .metricQuery,
                                          parameters:
                                              queryResults.execution
                                                  .usedParametersValues,
                                          timezone:
                                              queryResults.execution
                                                  .resolvedTimezone,
                                      },
                                      { emptyResult: true, review },
                                  )
                                : NO_RESULTS_RETRY_PROMPT,
                            metadata: {
                                status: 'success' as const,
                                queryCacheHit:
                                    queryResults.cacheMetadata?.cacheHit ===
                                    true,
                            },
                            structuredContent: { outcome: 'noResults' },
                        };
                    }

                    const csv = convertQueryResultsToCsv(
                        queryResults,
                        maxContextRows,
                    );
                    const table = buildShownTable(queryResults, maxContextRows);
                    return {
                        result: `${buildSavedChartHeader(
                            uuid,
                            name,
                            queryResults.execution.metricQuery,
                            {
                                includeFullSpec: true,
                            },
                        )}${getContextTruncationNote({
                            rowCount: queryResults.rows.length,
                            maxContextRows,
                        })}${serializeData(csv, 'csv')}${review}`,
                        metadata: {
                            status: 'success' as const,
                            queryCacheHit:
                                queryResults.cacheMetadata?.cacheHit === true,
                        },
                        structuredContent: {
                            outcome: 'rows',
                            chart: describeSavedChartSpec(
                                uuid,
                                name,
                                queryResults.execution.metricQuery,
                            ),
                            ...table,
                        },
                    };
                }

                const rawMetricQuery = source.metricQuery as Partial<
                    AiMetricQueryWithFilters & { limit: number | null }
                >;
                const metricQuery = {
                    dimensions: [],
                    metrics: [],
                    sorts: [],
                    tableCalculations: [],
                    additionalMetrics: [],
                    customMetrics: null,
                    ...rawMetricQuery,
                    exploreName: rawMetricQuery.exploreName ?? source.tableName,
                    filters: (rawMetricQuery.filters ?? {}) as Filters,
                    limit: getValidAiQueryLimit(
                        rawMetricQuery.limit ?? null,
                        maxLimit,
                    ),
                } as AiMetricQueryWithFilters;

                validateContent({
                    type: 'chart',
                    content: {
                        name: 'Query',
                        slug: 'query',
                        description: null,
                        tableName: source.tableName,
                        spaceSlug: 'agent-suggestions',
                        version: 1,
                        chartConfig: { type: 'table', config: {} },
                        tableConfig: { columnOrder: [] },
                        dashboardSlug: undefined,
                        pivotConfig: undefined,
                        parameters: source.parameters ?? undefined,
                        metricQuery,
                    } as unknown as ChartAsCode,
                });

                if (!enableDataAccess) {
                    return {
                        result: 'Data access is disabled for this agent. The metric query shape is valid, but row values cannot be returned.',
                        metadata: {
                            status: 'success' as const,
                        },
                        structuredContent: {
                            outcome: 'dataAccessDisabled',
                            chart: null,
                        },
                    };
                }

                const [queryResults, review] = await Promise.all([
                    runAsyncQuery(
                        metricQuery,
                        undefined,
                        source.parameters
                            ? (source.parameters as ParametersValuesMap)
                            : undefined,
                    ),
                    reviewQuery?.({
                        kind: 'semantic',
                        query: metricQuery,
                        parameters: source.parameters
                            ? (source.parameters as ParametersValuesMap)
                            : undefined,
                    }) ?? '',
                ]);

                if (queryResults.rows.length === 0) {
                    return {
                        result: reviewQuery
                            ? await reviewQuery(
                                  {
                                      kind: 'semantic',
                                      query: metricQuery,
                                      parameters: source.parameters
                                          ? (source.parameters as ParametersValuesMap)
                                          : undefined,
                                  },
                                  { emptyResult: true, review },
                              )
                            : NO_RESULTS_RETRY_PROMPT,
                        metadata: {
                            status: 'success' as const,
                            queryCacheHit:
                                queryResults.cacheMetadata?.cacheHit === true,
                        },
                        structuredContent: { outcome: 'noResults' },
                    };
                }

                const table = buildShownTable(queryResults, maxContextRows);
                return {
                    result: `${getContextTruncationNote({
                        rowCount: queryResults.rows.length,
                        maxContextRows,
                    })}${serializeData(
                        convertQueryResultsToCsv(queryResults, maxContextRows),
                        'csv',
                    )}${review}`,
                    metadata: {
                        status: 'success' as const,
                        queryCacheHit:
                            queryResults.cacheMetadata?.cacheHit === true,
                    },
                    structuredContent: {
                        outcome: 'rows',
                        chart: null,
                        ...table,
                    },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Error running content query.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
