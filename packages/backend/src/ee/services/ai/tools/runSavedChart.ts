import {
    getItemLabelWithoutTableName,
    getValidAiQueryLimit,
    runSavedChartToolDefinition,
    type AiMetricQueryWithFilters,
    type ItemsMap,
    type MetricQuery,
    type SavedChartSpec,
    type SavedChartStructure,
    type ToolRunSavedChartStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { type QueryReviewer } from '../decisions/queryReview';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
    UpdateProgressFn,
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

type Dependencies = {
    reviewQuery?: QueryReviewer;
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    getSavedChart: GetSavedChartFn;
    maxLimit: number;
    maxContextRows: number;
    enableDataAccess: boolean;
};

const toolDefinition = runSavedChartToolDefinition.for('agent');

/**
 * Builds a structural summary the LLM can read to understand what the saved
 * chart is querying. When `includeFullSpec` is false (data access disabled
 * mode), only field IDs are surfaced — filter values and sort/limit details
 * are omitted to keep filter values out of the LLM context.
 */
const buildSavedChartSpec = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
): SavedChartSpec => ({
    chartUuid,
    name,
    exploreName: metricQuery.exploreName,
    dimensions: metricQuery.dimensions,
    metrics: metricQuery.metrics,
    filters: metricQuery.filters,
    sorts: metricQuery.sorts,
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

const DATA_ACCESS_DISABLED_NOTE =
    'Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.';

export const buildSavedChartHeader = (
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

const toSavedChartStructure = ({
    chartUuid,
    name,
    exploreName,
    dimensions,
    metrics,
}: SavedChartSpec): SavedChartStructure => ({
    chartUuid,
    name,
    exploreName,
    dimensions,
    metrics,
});

// The rows written into context, computed once: the CSV block and the
// structured `columns`/`rows` are two renderings of these cells.
const buildShownTable = (
    queryResults: { rows: Record<string, unknown>[]; fields: ItemsMap },
    maxContextRows: number,
) => {
    const fieldIds = queryResults.rows[0]
        ? Object.keys(queryResults.rows[0])
        : [];
    const columns = fieldIds.map((fieldId) => {
        const item = queryResults.fields[fieldId];
        return {
            fieldId,
            label: item ? getItemLabelWithoutTableName(item) : fieldId,
        };
    });
    const cells = queryResults.rows
        .slice(0, maxContextRows)
        .map((row) =>
            CsvService.convertRowToCsv(
                row,
                queryResults.fields,
                true,
                fieldIds,
            ),
        );

    return {
        columns,
        rows: cells.map((rowCells) =>
            Object.fromEntries(
                fieldIds.map((fieldId, index) => [fieldId, rowCells[index]]),
            ),
        ),
        csv: stringify(cells, {
            header: true,
            columns: columns.map((column) => column.label),
        }),
    };
};

export const getRunSavedChart = ({
    reviewQuery,
    updateProgress,
    runAsyncQuery,
    getSavedChart,
    maxLimit,
    maxContextRows,
    enableDataAccess,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ chartUuid }) => {
            try {
                await updateProgress('Running saved chart...');

                const savedChart = await getSavedChart(chartUuid);
                const { metricQuery, name } = savedChart;

                if (!enableDataAccess) {
                    return {
                        result: `${buildSavedChartHeader(
                            chartUuid,
                            name,
                            metricQuery,
                            {
                                includeFullSpec: false,
                            },
                        )}${DATA_ACCESS_DISABLED_NOTE}`,
                        metadata: {
                            status: 'success',
                        },
                        structuredContent: {
                            status: 'data_access_disabled',
                            chart: toSavedChartStructure(
                                buildSavedChartSpec(
                                    chartUuid,
                                    name,
                                    metricQuery,
                                ),
                            ),
                            note: DATA_ACCESS_DISABLED_NOTE,
                        },
                    };
                }

                const aiMetricQuery: AiMetricQueryWithFilters = {
                    ...(reviewQuery ? metricQuery : {}),
                    exploreName: metricQuery.exploreName,
                    dimensions: metricQuery.dimensions,
                    metrics: metricQuery.metrics,
                    sorts: metricQuery.sorts,
                    limit: getValidAiQueryLimit(metricQuery.limit, maxLimit),
                    tableCalculations: metricQuery.tableCalculations,
                    additionalMetrics: metricQuery.additionalMetrics ?? [],
                    customMetrics: null,
                    filters: metricQuery.filters,
                };

                const [queryResults, review] = await Promise.all([
                    reviewQuery
                        ? runAsyncQuery(
                              aiMetricQuery,
                              undefined,
                              savedChart.parameters,
                          )
                        : runAsyncQuery(aiMetricQuery),
                    reviewQuery?.({
                        kind: 'semantic',
                        query: aiMetricQuery,
                        parameters: savedChart.parameters,
                    }) ?? '',
                ]);

                if (queryResults.rows.length === 0) {
                    return {
                        result: reviewQuery
                            ? await reviewQuery(
                                  {
                                      kind: 'semantic',
                                      query: aiMetricQuery,
                                      parameters: savedChart.parameters,
                                  },
                                  { emptyResult: true, review },
                              )
                            : NO_RESULTS_RETRY_PROMPT,
                        metadata: {
                            status: 'success',
                            queryCacheHit:
                                queryResults.cacheMetadata?.cacheHit === true,
                        },
                        structuredContent: {
                            status: 'no_results',
                            note: NO_RESULTS_RETRY_PROMPT,
                        },
                    };
                }

                const { columns, rows, csv } = buildShownTable(
                    queryResults,
                    maxContextRows,
                );
                return {
                    result: `${buildSavedChartHeader(
                        chartUuid,
                        name,
                        metricQuery,
                        {
                            includeFullSpec: true,
                        },
                    )}${getContextTruncationNote({
                        rowCount: queryResults.rows.length,
                        maxContextRows,
                    })}${serializeData(csv, 'csv')}${review}`,
                    metadata: {
                        status: 'success',
                        queryCacheHit:
                            queryResults.cacheMetadata?.cacheHit === true,
                    },
                    structuredContent: {
                        status: 'results',
                        chart: buildSavedChartSpec(
                            chartUuid,
                            name,
                            metricQuery,
                        ),
                        rowCount: queryResults.rows.length,
                        shownRowCount: rows.length,
                        truncated: rows.length < queryResults.rows.length,
                        columns,
                        rows,
                    },
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error running saved chart.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
