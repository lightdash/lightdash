import { AXIS_TITLE_COLOR, GRAY_4, GRAY_5, GRAY_7, WHITE } from './themeColors';

/**
 * Get axis label styling (for values like "Jan", "Feb", "Mar")
 */
export const getAxisLabelStyle = () => ({
    color: GRAY_7,
    fontWeight: '500',
    fontSize: 11.5,
});

/**
 * Get axis title styling (for titles like "Month", "Amount")
 */
export const getAxisTitleStyle = () => ({
    color: AXIS_TITLE_COLOR,
    fontWeight: '500',
    fontSize: 12,
});

/**
 * Get axis line styling (the main axis line)
 */
export const getAxisLineStyle = () => ({
    show: true,
    lineStyle: {
        color: GRAY_4,
        type: 'solid' as const,
    },
});

/**
 * Get tick line styling (small marks on axis)
 * @param show - Whether to show tick lines. Defaults to true when undefined for backwards compatibility with existing charts, false for new charts
 */
export const getAxisTickStyle = (show?: boolean) => ({
    // For backwards compatibility: undefined means show ticks (existing charts)
    // false means hide ticks (new charts default to hidden)
    show: show ?? true,
    lineStyle: {
        color: GRAY_4,
        type: 'solid' as const,
    },
});

/**
 * Get axis pointer styling (for highlighting when hovering over series)
 * @param useLinePointer - Whether to use line pointer (for line/area/scatter charts) or shadow pointer (for bar charts)
 */
export const getAxisPointerStyle = (useLinePointer: boolean = false) => {
    if (useLinePointer) {
        return {
            type: 'line' as const,
            lineStyle: {
                color: GRAY_5,
                type: [4, 2], // Dashed: 4px dash, 2px gap
                width: 1,
            },
            label: {
                show: true,
                fontWeight: 500,
                fontSize: 11,
                color: WHITE,
                backgroundColor: GRAY_7,
            },
        };
    }

    return {
        type: 'shadow' as const,
        label: {
            show: true,
            fontWeight: 500,
            fontSize: 11,
            color: WHITE,
            backgroundColor: GRAY_7,
        },
    };
};
