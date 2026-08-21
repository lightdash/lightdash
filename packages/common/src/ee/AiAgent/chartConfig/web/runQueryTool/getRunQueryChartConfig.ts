import { type ItemsMap } from '../../../../../types/field';
import { type MetricQuery } from '../../../../../types/metricQuery';
import { ChartType, type ChartConfig } from '../../../../../types/savedCharts';
import {
    isCustomChartTypePersistedChartConfig,
    isCustomChartTypeSlugChartConfig,
    type ToolRunQueryArgsTransformed,
} from '../../../schemas';
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
    const { chartConfig } = queryTool;

    // The persisted shape mirrors the saved-chart DataAppVizChart, so it
    // mounts the custom chart renderer as the chart config verbatim.
    if (isCustomChartTypePersistedChartConfig(chartConfig)) {
        return { type: ChartType.DATA_APP_VIZ, config: chartConfig };
    }

    // Un-enriched slug shape — only exists before the server resolves the
    // slug to a uuid, so it should never reach render; table is a safe no-op.
    if (isCustomChartTypeSlugChartConfig(chartConfig)) {
        return getTableChartConfig();
    }

    const chartType =
        overrideChartType ?? chartConfig?.defaultVizType ?? 'table';

    if (!canRenderAsChart(chartType, metricQuery)) {
        // Fallback to table if chart type is not valid
        return getTableChartConfig();
    }

    const builtinQueryTool = { ...queryTool, chartConfig };
    const metadata = {
        title: queryTool.title,
        description: queryTool.description,
    };

    switch (chartType) {
        case 'table':
            return getTableChartConfig();

        case 'bar':
            return getBarChartConfig({
                queryTool: builtinQueryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'horizontal':
            return getHorizontalBarChartConfig({
                queryTool: builtinQueryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'line':
            return getLineChartConfig({
                queryTool: builtinQueryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'scatter':
            return getScatterChartConfig({
                queryTool: builtinQueryTool,
                metricQuery,
                fieldsMap,
                chartConfig,
                metadata,
            });

        case 'pie':
            return getPieChartConfig({
                queryTool: builtinQueryTool,
                metricQuery,
            });

        case 'funnel':
            return getFunnelChartConfig({
                queryTool: builtinQueryTool,
                metricQuery,
            });

        default:
            throw new Error(`Unknown chart type: ${chartType}`);
    }
};
