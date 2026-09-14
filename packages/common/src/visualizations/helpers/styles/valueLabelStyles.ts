import { CartesianSeriesType, type Series } from '../../../types/savedCharts';
import { getReadableTextColor } from '../../../utils/colors';
import { BACKGROUND, FOREGROUND } from './themeColors';

/**
 * Label positions ECharts can render. Stacked bars resolve the configured
 * position to an `inside*` variant so a segment's label is painted on its own
 * bar instead of underneath the segment stacked after it.
 */
export type EChartsLabelPosition =
    | NonNullable<NonNullable<Series['label']>['position']>
    | 'insideTop'
    | 'insideRight';

/**
 * Get value label styling for any chart series (line, bar, area, scatter, etc.)
 * Size: 11px
 * @param position - Label position relative to data point
 * @param type - Series type
 * @param backgroundColor - Optional series color
 */
export const getValueLabelStyle = (
    position: EChartsLabelPosition | undefined,
    type: Series['type'],
    backgroundColor?: string,
) => {
    const isInside = position?.startsWith('inside') ?? false;

    const base = {
        fontSize: 11,
        fontWeight: isInside ? '400' : '500',
        color: FOREGROUND,
    } as const;

    // For bar charts with inside labels, use contrasting color based on bar color
    if (isInside && type === CartesianSeriesType.BAR && backgroundColor) {
        return {
            ...base,
            fontSize: 10,
            color: getReadableTextColor(backgroundColor),
            backgroundColor,
            borderRadius: 4,
            padding: [1, 2],
        };
    }

    // For line and area charts with inside labels, use border for legibility
    if (
        isInside &&
        (type === CartesianSeriesType.LINE || type === CartesianSeriesType.AREA)
    ) {
        return {
            ...base,
            textBorderColor: BACKGROUND,
            textBorderWidth: 1.5,
            textBorderType: 'solid',
        };
    }

    return base;
};
