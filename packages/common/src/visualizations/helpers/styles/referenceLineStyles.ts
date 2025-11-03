import { GRAY_7, GRAY_8, GRAY_9, WHITE } from './themeColors';

/**
 * Get reference line styling
 */
export const getReferenceLineStyle = (lineColor?: string) => {
    const defaultLineColor = lineColor || GRAY_9;

    return {
        emphasis: {
            disabled: true,
        },
        lineStyle: {
            color: defaultLineColor,
            type: [2, 3] as const, // Dotted: 2px dash, 3px gap
            width: 2,
        },
        label: {
            show: true,
            position: 'start' as const, // Start position (left side) to avoid right-edge clipping
            distance: -4, // Negative distance moves label into chart area
            formatter: (params: { name?: string; value?: number | string }) => {
                const text = params.name || String(params.value || '');
                // Simple truncation - ECharts doesn't handle wrapping well for mark line labels
                const maxChars = 15;
                return text.length > maxChars
                    ? `${text.substring(0, maxChars)}...`
                    : text;
            },
            backgroundColor: GRAY_7,
            color: WHITE,
            borderWidth: 1,
            borderColor: GRAY_8,
            padding: [2, 4],
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
        },
    };
};
