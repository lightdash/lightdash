import {
    getItemLabelWithoutTableName,
    getValidAiQueryLimit,
    runSavedChartToolDefinition,
    type AiMetricQueryWithFilters,
    type ItemsMap,
    type MetricQuery,
    type SavedChartSpec,
    type SavedChartStructure,
    type ToolRunSavedChartArgs,
    type ToolRunSavedChartStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';
import { NO_RESULTS_RETRY_PROMPT } from '../prompts/noResultsRetry';
import type {
    GetSavedChartFn,
    RunAsyncQueryFn,
    UpdateProgressFn,
} from '../types/aiAgentDependencies';
import { getContextTruncationNote } from '../utils/queryResultSummary';
import { serializeData } from '../utils/serializeData';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    updateProgress: UpdateProgressFn;
    runAsyncQuery: RunAsyncQueryFn;
    getSavedChart: GetSavedChartFn;
    maxLimit: number;
    maxContextRows: number;
    enableDataAccess: boolean;
};

type RunSavedChartExecuteResult =
    | ExecuteStructuredToolResult<ToolRunSavedChartStructuredContent>
    | ExecuteToolErrorResult;

const toolDefinition = runSavedChartToolDefinition.for('agent');

const DATA_ACCESS_DISABLED_NOTE =
    'Data access is disabled for this agent. Reason about the chart from its structure above; do not assume specific row values.';

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

// Data access disabled mode surfaces field ids only, so filter values and
// sort/limit details stay out of the LLM context.
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

const renderSavedChartHeader = (
    spec: SavedChartSpec,
    { includeFullSpec }: { includeFullSpec: boolean },
) => {
    const lines = [
        `Chart: "${spec.name}" (chartUuid: ${spec.chartUuid})`,
        `Explore: ${spec.exploreName}`,
        `Dimensions: ${spec.dimensions.join(', ') || '(none)'}`,
        `Metrics: ${spec.metrics.join(', ') || '(none)'}`,
    ];

    if (includeFullSpec) {
        lines.push(`Filters: ${JSON.stringify(spec.filters)}`);
        if (spec.sorts.length > 0) {
            lines.push(`Sorts: ${JSON.stringify(spec.sorts)}`);
        }
        lines.push(`Limit: ${spec.limit}`);
        if (spec.tableCalculations.length > 0) {
            lines.push(
                `Table calculations: ${spec.tableCalculations.join(', ')}`,
            );
        }
        if (spec.customMetrics.length > 0) {
            lines.push(`Custom metrics: ${spec.customMetrics.join(', ')}`);
        }
        if (spec.customDimensions.length > 0) {
            lines.push(
                `Custom dimensions: ${spec.customDimensions.join(', ')}`,
            );
        }
    }

    lines.push('', '');
    return lines.join('\n');
};

/**
 * Builds a structural summary the LLM can read to understand what the saved
 * chart is querying. When `includeFullSpec` is false (data access disabled
 * mode), only field IDs are surfaced.
 */
export const buildSavedChartHeader = (
    chartUuid: string,
    name: string,
    metricQuery: MetricQuery,
    options: { includeFullSpec: boolean },
) =>
    renderSavedChartHeader(
        buildSavedChartSpec(chartUuid, name, metricQuery),
        options,
    );

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

export const executeRunSavedChart = async (
    { chartUuid }: ToolRunSavedChartArgs,
    {
        updateProgress,
        runAsyncQuery,
        getSavedChart,
        maxLimit,
        maxContextRows,
        enableDataAccess,
    }: Dependencies,
): Promise<RunSavedChartExecuteResult> => {
    try {
        await updateProgress('Running saved chart...');

        const savedChart = await getSavedChart(chartUuid);
        const { metricQuery, name } = savedChart;
        const spec = buildSavedChartSpec(chartUuid, name, metricQuery);

        if (!enableDataAccess) {
            return {
                result: `${renderSavedChartHeader(spec, {
                    includeFullSpec: false,
                })}${DATA_ACCESS_DISABLED_NOTE}`,
                metadata: { status: 'success' },
                structuredContent: {
                    status: 'data_access_disabled',
                    chart: toSavedChartStructure(spec),
                    note: DATA_ACCESS_DISABLED_NOTE,
                },
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
            customMetrics: null,
            filters: metricQuery.filters,
        };

        const queryResults = await runAsyncQuery(aiMetricQuery);
        const rowCount = queryResults.rows.length;

        if (rowCount === 0) {
            return {
                result: NO_RESULTS_RETRY_PROMPT,
                metadata: { status: 'success' },
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
            result: `${renderSavedChartHeader(spec, {
                includeFullSpec: true,
            })}${getContextTruncationNote({
                rowCount,
                maxContextRows,
            })}${serializeData(csv, 'csv')}`,
            metadata: { status: 'success' },
            structuredContent: {
                status: 'results',
                chart: spec,
                rowCount,
                shownRowCount: rows.length,
                truncated: rows.length < rowCount,
                columns,
                rows,
            },
        };
    } catch (e) {
        return toolErrorOutput(e, 'Error running saved chart.');
    }
};

export const getRunSavedChart = (dependencies: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: (args) => executeRunSavedChart(args, dependencies),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
