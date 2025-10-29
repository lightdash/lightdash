import { type MantineTheme } from '@mantine/core';
import { isColorDark } from './colorUtils';

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
    color: string,
    position: 'left' | 'right' | 'top' | 'bottom' | 'inside' | undefined,
) => {
    let labelColor = theme.colors.gray[9];
    let fontWeight = 500;
    let textBorderColor = undefined;
    let textBorderWidth = undefined;

    if (position && position === 'inside') {
        fontWeight = 400;
        textBorderColor = color;
        textBorderWidth = 2;
        if (isColorDark(color)) {
            labelColor = '#FFFFFF';
        } else {
            labelColor = theme.colors.gray[9];
        }
    }

    return {
        color: labelColor,
        fontWeight,
        fontSize: 11,
        textBorderColor,
        textBorderWidth,
    };
};
