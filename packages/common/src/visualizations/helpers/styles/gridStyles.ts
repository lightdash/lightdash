import { GRAY_1, GRAY_2 } from './themeColors';

/**
 * Get grid line styling for line charts
 */
export const getLineChartGridStyle = () => ({
    show: true,
    lineStyle: {
        color: GRAY_1,
        type: 'solid' as const,
    },
});

/**
 * Get grid line styling for bar charts
 */
export const getBarChartGridStyle = () => ({
    show: true,
    lineStyle: {
        color: GRAY_2,
        type: [3, 3] as const, // [dash length, gap length]
    },
});
