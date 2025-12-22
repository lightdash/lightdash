import { getReadableColor, getReadableTextColor } from '../../../utils/colors';
import { GRAY_9 } from './themeColors';

/**
 * Get reference line styling
 * @param lineColor Optional custom color for the line
 * @param backgroundColor Background color to ensure contrast against (required for color adjustment)
 */
export const getReferenceLineStyle = (
    lineColor?: string,
    backgroundColor?: string,
) => {
    const defaultLineColor = lineColor || GRAY_9;
    // Adjust color for visibility if background color is provided
    const adjustedLineColor = backgroundColor
        ? getReadableColor(defaultLineColor, backgroundColor)
        : defaultLineColor;

    return {
        emphasis: {
            disabled: true,
        },
        lineStyle: {
            color: adjustedLineColor,
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
            backgroundColor: adjustedLineColor,
            color: getReadableTextColor(adjustedLineColor),
            borderWidth: 1,
            borderColor: adjustedLineColor,
            padding: [2, 4],
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
        },
    };
};
