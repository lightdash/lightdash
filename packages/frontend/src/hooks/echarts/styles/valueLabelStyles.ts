import { CartesianSeriesType, type Series } from '@lightdash/common';
import { type MantineTheme } from '@mantine/core';

/**
 * Get value label styling for any chart series (line, bar, area, scatter, etc.)
 * Inside: White on dark backgrounds, gray.9 on light backgrounds, weight 400
 * Outside: gray.9 text with colored border matching series, weight 500
 * Size: 11px
 * @param theme - Mantine theme
 * @param color - Series color for border/background detection
 * @param position - Label position relative to data point
 */
export const getValueLabelStyle = (
    theme: MantineTheme,
    position: 'left' | 'right' | 'top' | 'bottom' | 'inside' | undefined,
    type: Series['type'],
) => {
    const isInside = position === 'inside';

    const base = {
        fontSize: 11,
        fontWeight: '500',
    } as const;

    if (
        // inside labels for line and area series should have a white border - similar way to bar series for legibility
        isInside &&
        (type === CartesianSeriesType.LINE || type === CartesianSeriesType.AREA)
    ) {
        return {
            ...base,
            textBorderColor: theme.white,
            textBorderWidth: 2,
            textBorderType: 'solid',
        };
    }

    return base;
};
