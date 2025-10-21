import { type EChartsOption } from 'echarts';

type GetCommonEChartsConfigParams = {
    title?: string;
    metricsCount: number;
    chartData: Record<string, unknown>[];
    xAxisLabel?: string | null;
    yAxisLabel?: string | null;
    secondaryYAxisLabel?: string | null;
};

/**
 * Generates common echarts config for all chart types
 */
export const getCommonEChartsConfig = ({
    title,
    metricsCount,
    chartData,
    xAxisLabel,
    yAxisLabel,
    secondaryYAxisLabel,
}: GetCommonEChartsConfigParams): Pick<
    EChartsOption,
    | 'title'
    | 'legend'
    | 'grid'
    | 'animation'
    | 'backgroundColor'
    | 'dataset'
    | 'graphic'
> => {
    const graphicElements = [];

    // Add X-axis label at bottom center
    if (xAxisLabel) {
        graphicElements.push({
            type: 'text',
            left: 'center',
            bottom: 10,
            style: {
                text: xAxisLabel,
                fontSize: 12,
                fontWeight: 500,
            },
        });
    }

    // Add Y-axis label on left side, vertically centered and rotated
    if (yAxisLabel) {
        graphicElements.push({
            type: 'text',
            left: 10,
            top: 'center',
            rotation: Math.PI / 2,
            style: {
                text: yAxisLabel,
                fontSize: 12,
                fontWeight: 500,
            },
        });
    }

    // Add secondary Y-axis label on right side, vertically centered and rotated
    if (secondaryYAxisLabel) {
        graphicElements.push({
            type: 'text',
            right: 10,
            top: 'center',
            rotation: Math.PI / 2,
            style: {
                text: secondaryYAxisLabel,
                fontSize: 12,
                fontWeight: 500,
            },
        });
    }

    return {
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
            top: title ? 40 : 10, // Position below title if exists, otherwise at top
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
            containLabel: true, // Ensures labels are within grid bounds to prevent cutoff
            left: '5%', // Increased from 3% to give more space for Y-axis labels
            right: '5%', // Increased from 3% to give more space for labels on right
            // Account for title + legend at top
            top: (() => {
                if (title && metricsCount > 1) return 90; // Title + legend both present
                if (title) return 60; // Only title
                if (metricsCount > 1) return 50; // Only legend
                return 30; // Neither
            })(),
            bottom: 60, // Fixed bottom spacing for x-axis labels
        },
        animation: false,
        backgroundColor: '#fff',
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        ...(graphicElements.length > 0 ? { graphic: graphicElements } : {}),
    };
};
