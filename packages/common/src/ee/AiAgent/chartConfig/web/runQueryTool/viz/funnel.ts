import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    ChartType,
    FunnelChartDataInput,
    type FunnelChartConfig,
} from '../../../../../../types/savedCharts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';

export const getFunnelChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: ToolRunQueryArgsTransformed;
    metricQuery: MetricQuery;
}): FunnelChartConfig => {
    const { metrics, dimensions } = metricQuery;
    const { chartConfig } = queryTool;

    // The tool's funnelDataInput values don't match FunnelChartDataInput
    // semantics (ROW means stages across the metric columns of a single row,
    // COLUMN means one stage per row), so infer the mode from the query shape
    // instead of trusting the model's choice.
    const dataInput =
        dimensions.length === 0
            ? FunnelChartDataInput.ROW
            : FunnelChartDataInput.COLUMN;

    return {
        type: ChartType.FUNNEL,
        config: {
            fieldId: (chartConfig?.yAxisMetrics?.[0] || metrics[0]) as string,
            dataInput,
        },
    };
};
