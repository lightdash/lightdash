import {
    ChartType,
    derivePivotConfigurationFromChart,
    getRunQueryChartConfig,
    isCustomChartTypeSlugChartConfig,
    type ChartBuilderInput,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import {
    renderChart,
    toResultRows,
    type RenderedChart,
} from '@lightdash/visualization';
import { pivotQueryResults } from './pivotQueryResults';

/** The box Slack and MCP chart images draw in. */
export const AI_CHART_IMAGE_SIZE = { width: 800, height: 600 };

/**
 * Draws an agent's query answer the way the web app draws it: the tool's
 * chart config becomes the explorer chart config, a grouped chart pivots
 * its rows as the explorer's query does, and the chart engine renders the
 * result. Null when there is nothing to draw as a chart: no rows, a table,
 * or a custom chart type (those export through the headless browser).
 */
export const buildAiChart = ({
    queryTool,
    metricQuery,
    rows,
    fields,
    timezone,
}: {
    queryTool: ChartBuilderInput;
    metricQuery: MetricQuery;
    rows: Record<string, unknown>[];
    fields: ItemsMap;
    timezone?: string | null;
}): RenderedChart | null => {
    if (rows.length === 0) return null;
    if (isCustomChartTypeSlugChartConfig(queryTool.chartConfig)) return null;

    const chartConfig = getRunQueryChartConfig({
        queryTool,
        metricQuery,
        fieldsMap: fields,
    });
    if (chartConfig.type === ChartType.TABLE) return null;

    const groupBy = queryTool.chartConfig?.groupBy ?? undefined;
    const chart = {
        chartConfig,
        pivotConfig: groupBy?.length ? { columns: groupBy } : undefined,
        tableConfig: {
            columnOrder: [
                ...metricQuery.dimensions,
                ...metricQuery.metrics,
                ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
            ],
        },
    };
    const pivotConfiguration = chart.pivotConfig
        ? derivePivotConfigurationFromChart(chart, metricQuery, fields)
        : undefined;
    const pivoted = pivotConfiguration
        ? pivotQueryResults({
              rows,
              fields,
              pivotConfiguration,
              timezone: timezone ?? undefined,
          })
        : null;

    return renderChart(
        chart,
        {
            rows: toResultRows(pivoted?.rows ?? rows, fields, {
                timezone,
                pivotValuesColumns: pivoted?.pivotDetails.valuesColumns,
            }),
            fields,
            query: metricQuery,
            pivotDetails: pivoted?.pivotDetails,
            timezone,
        },
        { animation: false, size: AI_CHART_IMAGE_SIZE },
    );
};
