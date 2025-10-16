import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    type PieChartConfig,
    ChartType,
} from '../../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';

export const getPieChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
}): PieChartConfig => {
    const { dimensions } = queryTool.queryConfig;
    const { metrics } = metricQuery;

    const config: PieChartConfig['config'] = {
        groupFieldIds: dimensions,
        metricId: metrics[0] as string,
    };

    return {
        type: ChartType.PIE,
        config,
    };
};
