import Color from 'colorjs.io';

const IS_HEX_CODE_COLOR_REGEX =
    /^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/;

export const isHexCodeColor = (color: string): boolean =>
    IS_HEX_CODE_COLOR_REGEX.test(color);

/**
 * Validates an array of hex color codes
 * @param colors Array of strings to validate as hex colors
 * @returns Array of invalid colors found, empty if all are valid
 */
export const getInvalidHexColors = (colors: string[]): string[] =>
    colors.filter((color) => !isHexCodeColor(color));

/**
 * Processes an array of strings, trimming and filtering out empty values
 * @param colors Array of strings to process
 * @returns Cleaned array of strings
 */
export const cleanColorArray = (colors: string[]): string[] =>
    colors.map((color) => color.trim()).filter((color) => color.length > 0);

/**
 * Returns the best contrasting text color (black or white) for a given background color
 * Uses APCA contrast algorithm for accurate perception-based contrast
 * @param backgroundColor Any valid color string (hex, rgb, rgba, named colors, etc.)
 * @returns 'white' or 'black' depending on which has better contrast
 */
export const getReadableTextColor = (backgroundColor: string): string => {
    try {
        const onWhite = Math.abs(Color.contrastAPCA('white', backgroundColor));
        const onBlack = Math.abs(Color.contrastAPCA('black', backgroundColor));
        return onWhite > onBlack ? 'white' : 'black';
    } catch (e) {
        // Not supported color string, default to black
        return 'black';
    }
};
