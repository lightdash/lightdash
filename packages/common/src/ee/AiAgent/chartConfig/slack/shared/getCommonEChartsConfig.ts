import { type EChartsOption } from 'echarts';
import { getAxisPointerStyle } from '../../../../../visualizations/helpers/styles/axisStyles';
import { getLegendStyle } from '../../../../../visualizations/helpers/styles/legendStyles';
import { getTooltipStyle } from '../../../../../visualizations/helpers/styles/tooltipStyles';

type GetCommonEChartsConfigParams = {
    title?: string;
    showLegend: boolean;
    chartData: Record<string, unknown>[];
    xAxisLabel?: string | null;
    yAxisLabel?: string | null;
    secondaryYAxisLabel?: string | null;
    /** Use line pointer (for line/area/scatter) instead of shadow (for bar charts) */
    useLinePointer?: boolean;
    /** Whether to show tooltip on hover. Defaults to false (hidden for Slack static images) */
    showTooltip?: boolean;
};

const FONT_FAMILY = 'Inter, sans-serif';

/**
 * Generates common echarts config for all chart types
 */
export const getCommonEChartsConfig = ({
    title,
    showLegend,
    chartData,
    xAxisLabel,
    yAxisLabel,
    secondaryYAxisLabel,
    useLinePointer = false,
    showTooltip = false,
}: GetCommonEChartsConfigParams): Pick<
    EChartsOption,
    | 'title'
    | 'legend'
    | 'grid'
    | 'animation'
    | 'backgroundColor'
    | 'dataset'
    | 'graphic'
    | 'tooltip'
    | 'textStyle'
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
                fontFamily: FONT_FAMILY,
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
                fontFamily: FONT_FAMILY,
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
                fontFamily: FONT_FAMILY,
            },
        });
    }

    const legendBase = getLegendStyle('square');

    return {
        textStyle: {
            fontFamily: FONT_FAMILY,
        },
        ...(title
            ? {
                  title: {
                      text: title,
                      left: 'center',
                      top: 10,
                      textStyle: {
                          fontSize: 16,
                          fontWeight: 'bold' as const,
                          fontFamily: FONT_FAMILY,
                      },
                  },
              }
            : {}),
        tooltip: {
            show: showTooltip,
            trigger: 'axis' as const,
            ...getTooltipStyle({ appendToBody: false }),
            axisPointer: {
                ...getAxisPointerStyle(useLinePointer),
                label: {
                    show: true,
                    fontWeight: 500,
                    fontSize: 11,
                },
            },
        },
        legend: {
            show: showLegend,
            type: 'scroll' as const,
            orient: 'horizontal' as const,
            top: title ? 40 : 10, // Position below title if exists, otherwise at top
            left: 'center' as const,
            padding: [5, 10],
            ...legendBase,
        },
        grid: {
            containLabel: true, // Ensures labels are within grid bounds to prevent cutoff
            left: '5%', // Increased from 3% to give more space for Y-axis labels
            right: '5%', // Increased from 3% to give more space for labels on right
            // Account for title + legend at top
            top: (() => {
                if (title && showLegend) return 90; // Title + legend both present
                if (title) return 60; // Only title
                if (showLegend) return 50; // Only legend
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
