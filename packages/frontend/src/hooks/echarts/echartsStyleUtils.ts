import { type MantineTheme } from '@mantine/core';

type LegendIconType = 'line' | 'square';

/**
 * Check if a color is dark based on relative luminance
 * Uses WCAG formula for relative luminance
 * @param color - Hex color string (e.g., '#ff0000' or 'ff0000')
 * @returns true if the color is dark (luminance < 0.5)
 */
export const isColorDark = (color: string): boolean => {
    // Remove # if present
    const hex = color.replace('#', '');

    // Parse RGB values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Calculate relative luminance using WCAG formula
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    return luminance < 0.5;
};

export const getLegendStyle = (
    theme: MantineTheme,
    iconType: LegendIconType = 'square',
) => ({
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 16,
    ...(iconType === 'line'
        ? { icon: 'path://M2,5 L10,5 L10,7 L2,7 Z' }
        : { itemStyle: { borderRadius: 2 } }),
    textStyle: {
        color: theme.colors.gray[7],
        fontSize: 12,
        fontWeight: 500,
        padding: [0, 0, 0, 2],
    },
});

/**
 * Get border radius array for a bar chart data point
 * @param isHorizontal - Whether the bar chart is horizontal (flipAxes)
 * @param isStackEnd - Whether this data point is at the end (top/right) of the stack
 */
export const getBarBorderRadius = (
    isHorizontal: boolean,
    isStackEnd: boolean,
): number | number[] => {
    if (!isStackEnd) {
        return 0;
    }

    const radius = 4;

    // Horizontal (flipAxes): round right side [top-right, bottom-right, bottom-left, top-left]
    // Vertical: round top side [top-left, top-right, bottom-right, bottom-left]
    return isHorizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0];
};

/**
 * Get base bar styling configuration for cartesian charts
 */
export const getBarStyle = () => ({
    barCategoryGap: '25%', // Gap between bars: width is 3x the gap (75% / 25% = 3)
});

/**
 * Get axis label styling (for values like "Jan", "Feb", "Mar")
 * Color: gray.6, Weight: 500, Size: 11px
 */
export const getAxisLabelStyle = (theme: MantineTheme) => ({
    color: theme.colors.gray[6],
    fontWeight: '500',
    fontSize: 11,
});

/**
 * Get axis title styling (for titles like "Month", "Amount")
 * Color: gray.7, Weight: 500, Size: 12px
 */
export const getAxisTitleStyle = (theme: MantineTheme) => ({
    color: theme.colors.gray[7],
    fontWeight: '500',
    fontSize: 12,
});

/**
 * Get bar total label styling (values above/beside stacked bars)
 * Color: gray.9, Weight: 500, Size: 11px
 */
export const getBarTotalLabelStyle = (theme: MantineTheme) => ({
    color: theme.colors.gray[9],
    fontWeight: '500',
    fontSize: 11,
});

/**
 * Get pie slice styling (border radius and padding angle for gaps)
 * Border radius: 4px, Pad angle: 5 degrees for gaps between slices
 */
export const getPieSliceStyle = (isDonut: boolean) => ({
    padAngle: isDonut ? 2 : 0,
    itemStyle: {
        borderRadius: isDonut ? 4 : 0,
    },
});

/**
 * Get external label styling for pie charts
 * Category name: gray.6, 400 weight, 12px
 * Percentage/value: gray.7, 500 weight, 12px
 */
export const getPieExternalLabelStyle = (theme: MantineTheme) => ({
    fontSize: 12,
    // Rich text styles for different parts of the label
    rich: {
        name: {
            color: theme.colors.gray[6],
            fontWeight: 400,
            fontSize: 12,
        },
        value: {
            color: theme.colors.gray[7],
            fontWeight: 500,
            fontSize: 12,
        },
    },
});

/**
 * Get label line (connector) styling for pie chart external labels
 * Color: gray.3
 */
export const getPieLabelLineStyle = (theme: MantineTheme) => ({
    lineStyle: {
        color: theme.colors.gray[3],
    },
});

/**
 * Get internal label styling for pie charts (labels inside slices)
 * Color: White on dark backgrounds, gray.7 on light backgrounds
 * Weight: 500, Size: 12px
 * @param isOnDarkBackground - Whether the label is on a dark background
 */
export const getPieInternalLabelStyle = (
    theme: MantineTheme,
    isOnDarkBackground: boolean,
) => ({
    color: isOnDarkBackground ? '#FFFFFF' : theme.colors.gray[7],
    fontWeight: 500,
    fontSize: 12,
});
