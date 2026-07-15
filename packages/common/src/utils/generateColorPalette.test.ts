import { type OrganizationBrandColor } from '../types/organizationBrand';
import { isHexCodeColor } from './colors';
import {
    COLOR_PALETTE_LENGTH,
    generateColorPalette,
    generatePaletteFromBrandColors,
} from './generateColorPalette';

const brandColor = (
    hex: string,
    type: string = 'brand',
): OrganizationBrandColor => ({ hex, type, brightness: null });

describe('generateColorPalette', () => {
    it('expands a single seed into a full palette of valid hex colors', () => {
        const palette = generateColorPalette(['#7262ff']);
        expect(palette).toHaveLength(COLOR_PALETTE_LENGTH);
        expect(palette.every(isHexCodeColor)).toBe(true);
    });

    it('keeps the seed colors as the leading anchors in light mode', () => {
        const palette = generateColorPalette(['#7262ff', '#1a7f37']);
        expect(palette[0]).toBe('#7262ff');
        expect(palette[1]).toBe('#1a7f37');
    });

    it('returns an empty array when there are no valid seeds', () => {
        expect(generateColorPalette([])).toEqual([]);
        expect(generateColorPalette(['not-a-color', ''])).toEqual([]);
    });

    it('ignores invalid seeds but still generates from the valid ones', () => {
        const palette = generateColorPalette(['nope', '#ff0000']);
        expect(palette).toHaveLength(COLOR_PALETTE_LENGTH);
        expect(palette[0]).toBe('#ff0000');
    });

    it('respects a custom count', () => {
        expect(generateColorPalette(['#7262ff'], { count: 5 })).toHaveLength(5);
    });

    it('produces lighter colors in dark mode than a dark seed would give', () => {
        const [darkFirst] = generateColorPalette(['#00110a'], {
            darkMode: true,
        });
        const [lightFirst] = generateColorPalette(['#00110a'], {
            darkMode: false,
        });
        expect(darkFirst).not.toBe(lightFirst);
    });
});

describe('generatePaletteFromBrandColors', () => {
    it('generates matching-length light and dark palettes', () => {
        const { colors, darkColors } = generatePaletteFromBrandColors([
            brandColor('#7262ff', 'brand'),
            brandColor('#1a7f37', 'accent'),
        ]);
        expect(colors).toHaveLength(COLOR_PALETTE_LENGTH);
        expect(darkColors).toHaveLength(COLOR_PALETTE_LENGTH);
        expect(colors.every(isHexCodeColor)).toBe(true);
        expect(darkColors.every(isHexCodeColor)).toBe(true);
    });

    it('prioritises brand and accent roles over dark/light roles', () => {
        const { colors } = generatePaletteFromBrandColors([
            brandColor('#000000', 'dark'),
            brandColor('#ffffff', 'light'),
            brandColor('#7262ff', 'brand'),
        ]);
        expect(colors[0]).toBe('#7262ff');
    });

    it('deduplicates repeated brand colors', () => {
        const { colors } = generatePaletteFromBrandColors([
            brandColor('#7262ff', 'brand'),
            brandColor('#7262FF', 'accent'),
        ]);
        // Only one unique seed, so the second color must be a generated variant
        expect(colors[1]).not.toBe('#7262ff');
    });

    it('returns empty arrays when no brand colors are usable', () => {
        expect(generatePaletteFromBrandColors([])).toEqual({
            colors: [],
            darkColors: [],
        });
    });
});
