import { type EChartsOption } from 'echarts';
import {
    getPieExternalLabelStyle,
    getPieLabelLineStyle,
} from '../../../../../../visualizations/helpers/styles/pieChartStyles';
import { getTooltipStyle } from '../../../../../../visualizations/helpers/styles/tooltipStyles';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';

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
        ...getCommonEChartsConfig({
            title: queryTool.title,
            showLegend: false,
            chartData: rows,
        }),
        tooltip: {
            show: true,
            trigger: 'item',
            ...getTooltipStyle({ appendToBody: false }),
        },
        series: [
            {
                type: 'pie',
                data,
                label: {
                    formatter: '{b}: {c} ({d}%)',
                    ...getPieExternalLabelStyle(),
                },
                labelLine: getPieLabelLineStyle(),
            },
        ],
    };
};
