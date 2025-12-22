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

/**
 * Adjusts a color to ensure it has sufficient contrast against a background color
 * Keeps the color as close to the original as possible while meeting WCAG AA standards
 * @param foregroundColor Color to adjust (hex, rgb, rgba, named colors, etc.)
 * @param backgroundColor Background color to contrast against
 * @param targetContrast Target contrast ratio (default: 4.5 for WCAG AA)
 * @returns Adjusted color as hex string, or original if already readable
 */
export const getReadableColor = (
    foregroundColor: string,
    backgroundColor: string,
    targetContrast: number = 4.5,
): string => {
    try {
        const fg = new Color(foregroundColor);
        const bg = new Color(backgroundColor);

        const currentContrast = Math.abs(fg.contrast(bg, 'WCAG21'));
        if (currentContrast >= targetContrast) {
            return foregroundColor;
        }

        const fgLCH = fg.to('lch');
        const originalLightness = fgLCH.l;

        let bestColor = fg;
        let bestDelta = Infinity;

        // Try lightening
        for (
            let lightness = originalLightness;
            lightness <= 100;
            lightness += 5
        ) {
            const testColor = fgLCH.clone();
            testColor.l = lightness;
            const contrast = Math.abs(testColor.contrast(bg, 'WCAG21'));

            if (contrast >= targetContrast) {
                const delta = Math.abs(lightness - originalLightness);
                if (delta < bestDelta) {
                    bestColor = testColor;
                    bestDelta = delta;
                }
                break;
            }
        }

        // Try darkening
        for (
            let lightness = originalLightness;
            lightness >= 0;
            lightness -= 5
        ) {
            const testColor = fgLCH.clone();
            testColor.l = lightness;
            const contrast = Math.abs(testColor.contrast(bg, 'WCAG21'));

            if (contrast >= targetContrast) {
                const delta = Math.abs(lightness - originalLightness);
                if (delta < bestDelta) {
                    bestColor = testColor;
                    bestDelta = delta;
                }
                break;
            }
        }
        return bestColor.to('srgb').toString({ format: 'hex' });
    } catch (e) {
        return foregroundColor;
    }
};
