import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    ChartType,
    type PieChartConfig,
} from '../../../../../../types/savedCharts';
import type { runQueryTool, ToolInputTransformed } from '../../../../schemas';

type ToolRunQueryArgsTransformed = ToolInputTransformed<typeof runQueryTool>;

export const getPieChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
}): PieChartConfig => {
    const { dimensions } = queryTool.queryConfig;
    const { metrics } = metricQuery;
    const { chartConfig } = queryTool;

    const config: PieChartConfig['config'] = {
        groupFieldIds: dimensions,
        metricId: (chartConfig?.yAxisMetrics?.[0] || metrics[0]) as string,
    };

    return {
        type: ChartType.PIE,
        config,
    };
};
