import { type MantineTheme } from '@mantine/core';

/**
 * Get grid line styling for line charts
 */
export const getLineChartGridStyle = (theme: MantineTheme) => ({
    show: true,
    lineStyle: {
        color: theme.colors.gray[1],
        type: 'solid' as const,
    },
});

/**
 * Get grid line styling for bar charts
 */
export const getBarChartGridStyle = (theme: MantineTheme) => ({
    show: true,
    lineStyle: {
        color: theme.colors.gray[2],
        type: [3, 3] as const, // [dash length, gap length]
    },
});
