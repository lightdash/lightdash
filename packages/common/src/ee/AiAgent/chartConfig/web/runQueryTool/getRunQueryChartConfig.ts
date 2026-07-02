import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import { type ChartConfig } from '../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../schemas';
import { getTableChartConfig } from '../generateTableVizConfigTool/getTableChartConfig';
import { canRenderAsChart } from '../shared/canRenderAsChart';
import { type AiAgentChartTypeOption } from '../types';
import { getBarChartConfig } from './viz/bar';
import { getFunnelChartConfig } from './viz/funnel';
import { getHorizontalBarChartConfig } from './viz/horizontalBar';
import { getLineChartConfig } from './viz/line';
import { getPieChartConfig } from './viz/pie';
import { getScatterChartConfig } from './viz/scatter';

/**
 * Converts runQuery tool result to echarts config
 * This is the main function used for chart type switching
 */
export const getRunQueryChartConfig = ({
    queryTool,
    metricQuery,
    fieldsMap,
    overrideChartType,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
    fieldsMap: ItemsMap;
    overrideChartType?: AiAgentChartTypeOption;
}): ChartConfig => {
    const chartType =
        overrideChartType ?? queryTool.chartConfig?.defaultVizType ?? 'table';

    if (!canRenderAsChart(chartType, metricQuery)) {
        // Fallback to table if chart type is not valid
        return getTableChartConfig();
    }

    const { chartConfig } = queryTool;
    const metadata = {
        title: queryTool.title,
        description: queryTool.description,
    };

    switch (chartType) {
        case 'table':
            return getTableChartConfig();

        case 'bar':
            return getBarChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'horizontal':
            return getHorizontalBarChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'line':
            return getLineChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'scatter':
            return getScatterChartConfig({
                queryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'pie':
            return getPieChartConfig({
                queryTool,
                metricQuery,
            });

        case 'funnel':
            return getFunnelChartConfig({
                queryTool,
                metricQuery,
            });

        default:
            throw new Error(`Unknown chart type: ${chartType}`);
    }
};
