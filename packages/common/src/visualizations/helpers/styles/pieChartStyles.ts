import { BACKGROUND, GRAY_3, GRAY_6, GRAY_7 } from './themeColors';

/**
 * Calculate border radius based on slice percentage
 * Uses a smooth scaling formula to prevent over-rounding on small slices
 */
export const calculateBorderRadiusForSlice = (percent: number): number => {
    const MAX_RADIUS = 4;
    const MIN_RADIUS = 2;
    const THRESHOLD_PERCENT = 2;

    if (percent >= THRESHOLD_PERCENT) {
        return MAX_RADIUS;
    }

    // For smaller slices, scale proportionally to create a smooth curve from MIN_RADIUS to MAX_RADIUS
    const scale = percent / THRESHOLD_PERCENT;
    return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * scale;
};

/**
 * Get pie slice styling for series-level configuration
 * Note: borderRadius is applied per data point in the frontend
 * to enable dynamic sizing based on slice percentage
 */
export const getPieSliceStyle = (isDonut: boolean) =>
    isDonut
        ? {
              itemStyle: {
                  borderColor: BACKGROUND,
                  borderWidth: 2,
              },
          }
        : {};

/**
 * Get external label styling for pie charts
 */
export const getPieExternalLabelStyle = () => ({
    fontSize: 12,
    lineHeight: 18,
    // Rich text styles for different parts of the label
    rich: {
        name: {
            color: GRAY_6,
            fontWeight: 500,
            fontSize: 12,
            lineHeight: 18,
        },
        value: {
            color: GRAY_7,
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 18,
        },
    },
});

/**
 * Get label line (connector) styling for pie chart external labels
 */
export const getPieLabelLineStyle = () => ({
    lineStyle: {
        color: GRAY_3,
    },
});

/**
 * Get internal label styling for pie charts (labels inside slices)
 */
export const getPieInternalLabelStyle = () => ({
    fontWeight: 500,
    fontSize: 12,
});
