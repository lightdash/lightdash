import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    ChartType,
    type FunnelChartConfig,
    FunnelChartDataInput,
} from '../../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';

export const getFunnelChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
}): FunnelChartConfig => {
    const { metrics } = metricQuery;
    const { chartConfig } = queryTool;

    let dataInput = FunnelChartDataInput.COLUMN;
    if (chartConfig?.funnelDataInput === 'row') {
        dataInput = FunnelChartDataInput.ROW;
    }

    return {
        type: ChartType.FUNNEL,
        config: {
            fieldId: (chartConfig?.yAxisMetrics?.[0] || metrics[0]) as string,
            dataInput,
        },
    };
};
