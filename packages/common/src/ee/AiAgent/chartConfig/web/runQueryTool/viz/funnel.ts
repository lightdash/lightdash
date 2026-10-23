import { type MetricQuery } from '../../../../../../types/metricQuery';
import {
    ChartType,
    FunnelChartDataInput,
    type FunnelChartConfig,
} from '../../../../../../types/savedCharts';
import { isMetricsOnlyFunnel } from '../../../shared/isMetricsOnlyFunnel';
import { type RunQueryBuiltinChartInput } from '../../types';

export const getFunnelChartConfig = ({
    queryTool,
    metricQuery,
}: {
    queryTool: RunQueryBuiltinChartInput;
    metricQuery: MetricQuery;
}): FunnelChartConfig => {
    const { metrics } = metricQuery;
    const { chartConfig } = queryTool;

    // FunnelChartDataInput.ROW means stages across the metric columns of a
    // single row; COLUMN means one stage per row. The query shape fully
    // determines which applies, so it is derived rather than model-chosen.
    const dataInput = isMetricsOnlyFunnel(metricQuery)
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
