import { type EChartsOption } from 'echarts';

/**
 * Generates common echarts config for all chart types
 */
export const getCommonEChartsConfig = (
    title: string | undefined,
    metricsCount: number,
    chartData: Record<string, unknown>[],
): Pick<
    EChartsOption,
    'title' | 'legend' | 'grid' | 'animation' | 'backgroundColor' | 'dataset'
> => ({
    ...(title
        ? {
              title: {
                  text: title,
                  left: 'center',
                  top: 10,
                  textStyle: {
                      fontSize: 16,
                      fontWeight: 'bold' as const,
                  },
              },
          }
        : {}),
    legend: {
        show: metricsCount > 1,
        type: 'scroll' as const,
        orient: 'horizontal' as const,
        bottom: 10,
        left: 'center' as const,
        padding: [5, 10],
        itemGap: 15,
        itemWidth: 25,
        itemHeight: 14,
        textStyle: {
            fontSize: 11,
        },
        pageIconSize: 12,
        pageTextStyle: {
            fontSize: 11,
        },
    },
    grid: {
        containLabel: true,
        left: '3%',
        right: '3%',
        top: title ? 50 : 20,
        bottom: metricsCount > 1 ? 70 : 50,
    },
    animation: false,
    backgroundColor: '#fff',
    dataset: {
        source: chartData,
        dimensions: Object.keys(chartData[0] || {}),
    },
});
