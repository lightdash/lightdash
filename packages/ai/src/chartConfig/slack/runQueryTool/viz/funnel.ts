import { type EChartsOption } from 'echarts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';

/**
 * Generates funnel chart echarts config for server-side rendering
 */
export const getFunnelChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
): EChartsOption => {
    const { dimensions, metrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;

    const metricField = chartConfig?.yAxisMetrics?.[0] || metrics[0];

    // Transform data for funnel chart
    const data = rows.map((row) => {
        // Use first dimension as the name
        const name = dimensions.length > 0 ? String(row[dimensions[0]]) : '';
        return {
            name,
            value: row[metricField] as number,
        };
    });

    return {
        ...getCommonEChartsConfig({
            title: queryTool.title,
            showLegend: false,
            chartData: rows,
        }),
        tooltip: {
            show: true,
            trigger: 'item' as const,
        },
        legend: {
            show: true,
            orient: 'horizontal',
            bottom: 10,
        },
        series: [
            {
                type: 'funnel',
                data,
                label: {
                    position: 'inside',
                },
                sort: 'descending',
            },
        ],
    };
};
