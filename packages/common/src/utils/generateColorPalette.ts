import Color from 'colorjs.io';
import { type OrganizationBrandColor } from '../types/organizationBrand';
import { isHexCodeColor } from './colors';

/**
 * Number of colors a Lightdash color palette must contain.
 */
export const COLOR_PALETTE_LENGTH = 20;

/**
 * Golden-angle hue rotation (in degrees). Spreading generated hues by this
 * amount keeps successive colors visually distinct instead of clustering.
 */
const GOLDEN_ANGLE = 137.508;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

const toHex = (color: Color): string =>
    color.to('srgb').toGamut().toString({ format: 'hex' });

type LightnessRange = { min: number; max: number };

// Brand colors are usually tuned for light backgrounds, so the light palette
// keeps them almost untouched while the dark palette lifts them into a range
// that stays legible on a dark canvas.
const LIGHT_LIGHTNESS: LightnessRange = { min: 0.32, max: 0.88 };
const DARK_LIGHTNESS: LightnessRange = { min: 0.55, max: 0.85 };

/**
 * Remaps a lightness value into the target range. Colors already inside the
 * range are left as-is; colors outside are pulled to the nearest bound.
 */
const fitLightness = (lightness: number, range: LightnessRange): number =>
    clamp(lightness, range.min, range.max);

/**
 * Expands a list of seed colors into exactly `count` distinct colors.
 *
 * The seed colors are used as the leading anchors, then additional colors are
 * derived by rotating the hue of each seed (golden angle) and nudging its
 * lightness. This keeps the brand's own colors prominent while filling the
 * palette with harmonious variations.
 */
export const generateColorPalette = (
    seedColors: string[],
    { darkMode = false, count = COLOR_PALETTE_LENGTH } = {},
): string[] => {
    const range = darkMode ? DARK_LIGHTNESS : LIGHT_LIGHTNESS;

    const seeds = seedColors.filter(isHexCodeColor);
    if (seeds.length === 0) {
        return [];
    }

    // Each base is the seed's [lightness, chroma, hue] in OKLCH.
    const bases = seeds.map((hex) => new Color(hex).to('oklch').coords);

    const makeColor = (
        [lightness, chroma, hue]: [number, number, number],
        hueShift: number,
        lightnessShift: number,
    ): string => {
        const safeHue = Number.isNaN(hue) ? 0 : hue;
        const oklch = new Color('oklch', [
            fitLightness(lightness + lightnessShift, range),
            chroma,
            (safeHue + hueShift) % 360,
        ]);
        return toHex(oklch);
    };

    // Anchor the palette on the brand colors. Light mode keeps their exact hex;
    // dark mode fits their lightness so a very dark brand color still shows.
    const result: string[] = darkMode
        ? bases.map((base) => makeColor(base, 0, 0))
        : [...seeds];

    // Later rounds fan out around each anchor with a growing hue rotation and
    // an alternating lightness nudge to avoid repeats when hues wrap around.
    for (let round = 1; result.length < count; round += 1) {
        for (let i = 0; i < bases.length && result.length < count; i += 1) {
            const hueShift = round * GOLDEN_ANGLE;
            const lightnessShift =
                (round % 2 === 0 ? 1 : -1) * 0.06 * Math.ceil(round / 2);
            result.push(makeColor(bases[i], hueShift, lightnessShift));
        }
    }

    return result.slice(0, count);
};

/**
 * Orders brand colors so the most palette-worthy roles come first. `dark` and
 * `light` roles are typically background/text colors, so they are pushed to the
 * back where they only appear if there aren't enough vivid brand colors.
 */
const BRAND_COLOR_ROLE_PRIORITY: Record<string, number> = {
    brand: 0,
    accent: 1,
    other: 2,
    dark: 3,
    light: 4,
};

const orderBrandColors = (
    brandColors: OrganizationBrandColor[],
): string[] => {
    const seen = new Set<string>();
    return [...brandColors]
        .sort(
            (a, b) =>
                (BRAND_COLOR_ROLE_PRIORITY[a.type] ?? 2) -
                (BRAND_COLOR_ROLE_PRIORITY[b.type] ?? 2),
        )
        .map((color) => color.hex)
        .filter((hex) => isHexCodeColor(hex))
        .filter((hex) => {
            const key = hex.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

/**
 * Generates a full light + dark color palette from an organization's brand
 * colors. Returns empty arrays when there are no usable brand colors so callers
 * can fall back to a default palette.
 */
export const generatePaletteFromBrandColors = (
    brandColors: OrganizationBrandColor[],
): { colors: string[]; darkColors: string[] } => {
    const seeds = orderBrandColors(brandColors);
    return {
        colors: generateColorPalette(seeds, { darkMode: false }),
        darkColors: generateColorPalette(seeds, { darkMode: true }),
    };
};
