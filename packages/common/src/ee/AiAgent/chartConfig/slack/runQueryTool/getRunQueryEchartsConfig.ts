import { type EChartsOption } from 'echarts';
import { type ToolRunQueryArgsTransformed } from '../../../schemas';
import { type GetPivotedResultsFn, type QueryResults } from '../types';
import { getBarChartEchartsConfig } from './viz/bar';
import { getFunnelChartEchartsConfig } from './viz/funnel';
import { getHorizontalBarChartEchartsConfig } from './viz/horizontalBar';
import { getLineChartEchartsConfig } from './viz/line';
import { getPieChartEchartsConfig } from './viz/pie';
import { getScatterChartEchartsConfig } from './viz/scatter';

/**
 * Generates echarts options from ToolRunQueryArgs
 * Helpful for generating charts for AI agents on Slack
 * @param queryTool - ToolRunQueryArgsTransformed
 * @param queryResults - QueryResults
 * @param getPivotedResults - Function to pivot data (backend dependency)
 * @returns EChartsOption | null
 */
export const getRunQueryEchartsConfig = async (
    queryTool: ToolRunQueryArgsTransformed,
    queryResults: QueryResults,
    getPivotedResults: GetPivotedResultsFn,
): Promise<EChartsOption | null> => {
    const chartType = queryTool.chartConfig?.defaultVizType ?? 'table';

    // Don't render table as image
    if (chartType === 'table') {
        return Promise.resolve(null);
    }

    const { rows, fields: fieldsMap } = queryResults;

    // Empty data - don't render
    if (rows.length === 0) {
        return Promise.resolve(null);
    }

    switch (chartType) {
        case 'bar':
            return getBarChartEchartsConfig(
                queryTool,
                rows,
                fieldsMap,
                getPivotedResults,
            );

        case 'horizontal':
            return getHorizontalBarChartEchartsConfig(
                queryTool,
                rows,
                fieldsMap,
                getPivotedResults,
            );

        case 'line':
            return getLineChartEchartsConfig(
                queryTool,
                rows,
                fieldsMap,
                getPivotedResults,
            );

        case 'scatter':
            return getScatterChartEchartsConfig(
                queryTool,
                rows,
                fieldsMap,
                getPivotedResults,
            );

        case 'pie':
            return getPieChartEchartsConfig(queryTool, rows);

        case 'funnel':
            return getFunnelChartEchartsConfig(queryTool, rows);

        default:
            return Promise.resolve(null);
    }
};
