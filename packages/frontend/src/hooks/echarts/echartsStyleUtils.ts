import { type MantineTheme } from '@mantine/core';

type LegendIconType = 'line' | 'square';

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
    return isHorizontal
        ? [0, radius, radius, 0]
        : [radius, radius, 0, 0];
};

/**
 * Get base bar styling configuration for cartesian charts
 */
export const getBarStyle = () => ({
    barCategoryGap: '25%', // Gap between bars: width is 3x the gap (75% / 25% = 3)
});
