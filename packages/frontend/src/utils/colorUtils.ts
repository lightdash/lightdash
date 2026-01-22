import {
    isHexCodeColor,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingMinMax,
} from '@lightdash/common';
import Color from 'colorjs.io';
import { DARK_MODE_COLORS } from '../mantineTheme';

/**
 * Replaces 'problematic' colors in dark mode for better visibility
 */
export const transformColorsForDarkMode = (
    colorRange: ConditionalFormattingColorRange,
): ConditionalFormattingColorRange => {
    let startColor = colorRange.start;
    let endColor = colorRange.end;

    const startColorLuminance = new Color(startColor).get('lch.l');
    const endColorLuminance = new Color(endColor).get('lch.l');

    // color luminance > 85 indicates light colors
    const isStartLight = startColorLuminance > 85;
    const isEndLight = endColorLuminance > 85;
    // color luminance < 15 indicates dark colors
    const isStartDark = startColorLuminance < 15;
    const isEndDark = endColorLuminance < 15;

    if (isStartLight && isEndDark) {
        // Light-to-dark gradient (e.g., white to black)
        // White (background-like) → closer to background, Black (contrasting) → more visible
        startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        endColor = DARK_MODE_COLORS.CONTRAST_GRAY;
    } else if (isStartDark && isEndLight) {
        // Dark-to-light gradient (e.g., black to white)
        // Black (contrasting) → more visible, White (background-like) → closer to background
        startColor = DARK_MODE_COLORS.CONTRAST_GRAY;
        endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
    } else {
        // Single-end problematic colors
        if (isStartLight) {
            // Very light start color -> visible dark gray (not background)
            startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isStartDark) {
            // Very dark start color -> slightly lighter
            startColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isEndLight) {
            // Very light end color -> visible dark gray (not background)
            endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
        if (isEndDark) {
            // Very dark end color -> slightly lighter
            endColor = DARK_MODE_COLORS.SUBTLE_GRAY;
        }
    }

    return { start: startColor, end: endColor };
};

const getColorRange = (colorConfig: ConditionalFormattingColorRange) => {
    if (
        !isHexCodeColor(colorConfig.start) ||
        !isHexCodeColor(colorConfig.end)
    ) {
        return undefined;
    }

    return Color.range(
        new Color(colorConfig.start),
        new Color(colorConfig.end),
        {
            space: 'srgb',
        },
    );
};

export const getColorFromRange = (
    value: number,
    colorRange: ConditionalFormattingColorRange,
    minMaxRange: ConditionalFormattingMinMax,
): string | undefined => {
    const interpolateColor = getColorRange(colorRange);

    if (!interpolateColor) return undefined;

    const min = minMaxRange.min;
    const max = minMaxRange.max;

    if (min > max || value < min || value > max) {
        console.error(
            new Error(
                `invalid minMaxRange: [${min},${max}] or value: ${value}`,
            ),
        );
        return undefined;
    }

    if (min === max) {
        return interpolateColor(1).toString({ format: 'hex' });
    }

    const percentage = (value - min) / (max - min);

    return interpolateColor(percentage).toString({ format: 'hex' });
};

/**
 * Interpolates a color from an array of colors based on a normalized value (0-1).
 * Uses piecewise linear interpolation between adjacent color stops.
 */
export const interpolateMultiColor = (colors: string[], t: number): string => {
    if (colors.length === 0) return '#888888';
    if (colors.length === 1) return colors[0];

    // Clamp t to [0, 1]
    const clampedT = Math.max(0, Math.min(1, t));

    // Find which segment we're in
    const segmentCount = colors.length - 1;
    const segmentIndex = Math.min(
        Math.floor(clampedT * segmentCount),
        segmentCount - 1,
    );

    // Get local t within the segment (0-1)
    const segmentStart = segmentIndex / segmentCount;
    const segmentEnd = (segmentIndex + 1) / segmentCount;
    const localT = (clampedT - segmentStart) / (segmentEnd - segmentStart);

    // Interpolate between the two colors in this segment
    const startColor = new Color(colors[segmentIndex]);
    const endColor = new Color(colors[segmentIndex + 1]);
    // Using oklab for perceptually uniform gradients (better for data visualization)
    const range = Color.range(startColor, endColor, { space: 'oklab' });

    return range(localT).toString({ format: 'hex' });
};

/**
 * Creates a color scale function that maps values in a domain to colors.
 * Similar to D3's scaleLinear but uses colorjs.io for interpolation.
 */
export const createMultiColorScale = (
    min: number,
    max: number,
    colors: string[],
): ((value: number) => string) => {
    if (colors.length === 0) return () => '#888888';
    if (colors.length === 1) return () => colors[0];
    if (max === min) return () => colors[Math.floor(colors.length / 2)];

    return (value: number): string => {
        // Clamp value to domain
        const clampedValue = Math.max(min, Math.min(max, value));
        // Normalize to 0-1
        const t = (clampedValue - min) / (max - min);
        return interpolateMultiColor(colors, t);
    };
};
