import { getLuminance } from 'polished';

/**
 * Check if a color is dark based on relative luminance
 * @param color - Hex color string (e.g., '#ff0000' or 'ff0000')
 * @returns true if the color is dark (luminance < 0.5)
 */
export const isColorDark = (color: string): boolean => {
    return getLuminance(color) < 0.5;
};
