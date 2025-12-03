import { CartesianSeriesType, type Series } from '../../../types/savedCharts';
import { BACKGROUND, FOREGROUND } from './themeColors';

/**
 * Get value label styling for any chart series (line, bar, area, scatter, etc.)
 * Inside: White on dark backgrounds, gray.9 on light backgrounds, weight 500
 * Outside: gray.9 text with colored border matching series, weight 600
 * Size: 11px
 * @param position - Label position relative to data point
 * @param type - Series type
 */
export const getValueLabelStyle = (
    position: 'left' | 'right' | 'top' | 'bottom' | 'inside' | undefined,
    type: Series['type'],
) => {
    const isInside = position === 'inside';

    const base = {
        fontSize: 11,
        fontWeight: isInside ? '400' : '500',
        color: FOREGROUND,
    } as const;

    if (
        // inside labels for line and area series should have a white border - similar way to bar series for legibility
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
