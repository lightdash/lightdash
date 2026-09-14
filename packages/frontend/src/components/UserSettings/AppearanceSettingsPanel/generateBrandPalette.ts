import Color from 'colorjs.io';

const BRAND_PALETTE_SIZE = 20;

const isValidHexColor = (hex: string): boolean =>
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * Expands a handful of brand colors into a full categorical chart palette.
 * Seeds come first, then variants are derived in OKLCH (perceptually uniform)
 * by rotating hue and alternating lightness so neighbours stay distinct.
 */
export const generateBrandPalette = (
    hexes: string[],
    size: number = BRAND_PALETTE_SIZE,
): string[] => {
    const seeds = [
        ...new Set(
            hexes.filter(isValidHexColor).map((hex) => hex.toLowerCase()),
        ),
    ];
    if (seeds.length === 0) return [];

    const palette = seeds.slice(0, size);
    let variant = 0;
    while (palette.length < size) {
        const seed = seeds[variant % seeds.length];
        const round = Math.floor(variant / seeds.length) + 1;
        const color = new Color(seed).to('oklch');
        color.set(
            'oklch.h',
            (h) => ((Number.isNaN(h) ? 0 : h) + round * 33) % 360,
        );
        color.set('oklch.l', (l) =>
            clamp(l + (round % 2 === 0 ? 0.12 : -0.08), 0.45, 0.8),
        );
        color.set('oklch.c', (c) => Math.max(c, 0.12));
        palette.push(color.to('srgb').toGamut().toString({ format: 'hex' }));
        variant += 1;
    }
    return palette;
};
