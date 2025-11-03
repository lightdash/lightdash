import { GRAY_3, GRAY_6, GRAY_7, WHITE } from './themeColors';

/**
 * Get pie slice styling
 */
export const getPieSliceStyle = (isDonut: boolean) =>
    isDonut
        ? {
              itemStyle: {
                  borderRadius: 4,
                  borderColor: WHITE,
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
