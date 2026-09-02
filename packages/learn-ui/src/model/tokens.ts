// Brand accent: hosts set --learn-accent (in-app: the Mantine ldBrandViolet-6
// token); the fallback is Lightdash violet so the standalone academy needs no setup.
export const LEARN_ACCENT = 'var(--learn-accent, #7262FF)';

// No rgb-triplet custom property exists for the accent; the alpha ramp stays literal.
const BRAND_VIOLET_RGB = '94, 76, 255';

export const progressFill = (progress: number): string =>
    progress >= 1
        ? LEARN_ACCENT
        : `rgba(${BRAND_VIOLET_RGB}, ${(0.07 + 0.55 * progress).toFixed(2)})`;
