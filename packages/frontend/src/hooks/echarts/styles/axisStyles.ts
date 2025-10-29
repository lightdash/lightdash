import { type MantineTheme } from '@mantine/core';

/**
 * Get axis label styling (for values like "Jan", "Feb", "Mar")
 */
export const getAxisLabelStyle = (theme: MantineTheme) => ({
    color: theme.colors.gray[7],
    fontWeight: '500',
    fontSize: 11.5,
});

/**
 * Get axis title styling (for titles like "Month", "Amount")
 */
export const getAxisTitleStyle = () => ({
    color: '#747B83',
    fontWeight: '500',
    fontSize: 12,
});

/**
 * Get axis line styling (the main axis line)
 */
export const getAxisLineStyle = (theme: MantineTheme) => ({
    show: true,
    lineStyle: {
        color: theme.colors.gray[3],
        type: 'solid' as const,
    },
});

/**
 * Get tick line styling (small marks on axis)
 */
export const getAxisTickStyle = (theme: MantineTheme) => ({
    show: true,
    lineStyle: {
        color: theme.colors.gray[3],
        type: 'solid' as const,
    },
});

/**
 * Get axis pointer styling (for highlighting when hovering over series)
 */
export const getAxisPointerStyle = (theme: MantineTheme) => ({
    type: 'shadow' as const,
    label: {
        show: true,
        fontWeight: 500,
        fontSize: 11,
        color: '#FFFFFF',
        backgroundColor: theme.colors.gray[7],
    },
});
