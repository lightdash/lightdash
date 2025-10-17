import { type EChartsOption } from 'echarts';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';

/**
 * Generates pie chart echarts config for server-side rendering
 */
export const getPieChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
): EChartsOption => {
    const { dimensions, metrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;

    const groupField = dimensions[0];
    const metricField = chartConfig?.yAxisMetrics?.[0] || metrics[0];

    // Transform data for pie chart
    const data = rows.map((row) => ({
        name: String(row[groupField]),
        value: row[metricField] as number,
    }));

    return {
        ...(queryTool.title ? { title: { text: queryTool.title } } : {}),
        legend: {
            show: true,
            orient: 'horizontal',
            bottom: 10,
        },
        animation: false,
        backgroundColor: '#fff',
        series: [
            {
                type: 'pie',
                data,
                label: {
                    formatter: '{b}: {c} ({d}%)',
                },
            },
        ],
    };
};
