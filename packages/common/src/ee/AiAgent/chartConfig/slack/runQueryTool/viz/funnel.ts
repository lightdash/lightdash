import { type EChartsOption } from 'echarts';
import { type ItemsMap } from '../../../../../../types/field';
import { getItemLabelWithoutTableName } from '../../../../../../utils/item';
import { type ToolRunQueryArgsTransformed } from '../../../../schemas';
import { getCommonEChartsConfig } from '../../shared/getCommonEChartsConfig';

/**
 * Generates funnel chart echarts config for server-side rendering
 */
export const getFunnelChartEchartsConfig = (
    queryTool: ToolRunQueryArgsTransformed,
    rows: Record<string, unknown>[],
    fieldsMap: ItemsMap,
): EChartsOption => {
    const { dimensions, metrics } = queryTool.queryConfig;
    const { chartConfig } = queryTool;

    const metricField = chartConfig?.yAxisMetrics?.[0] || metrics[0];

    // Stages come from rows (dimension + metric) or, for single-row results
    // without dimensions, from the metric columns themselves
    const data =
        dimensions.length === 0
            ? metrics.map((metric) => {
                  const item = fieldsMap[metric];
                  return {
                      name: item ? getItemLabelWithoutTableName(item) : metric,
                      value: rows[0][metric] as number,
                  };
              })
            : rows.map((row) => ({
                  name: String(row[dimensions[0]]),
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
