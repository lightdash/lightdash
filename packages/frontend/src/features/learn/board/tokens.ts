// Values mirror the Lightdash design system; brand violet = theme ldBrandViolet[6].

// Mantine exposes no rgb triplet variable for ldBrandViolet; needed for the inline alpha ramp.
const BRAND_VIOLET_RGB = '94, 76, 255';

export const progressFill = (progress: number): string =>
    progress >= 1
        ? 'var(--mantine-color-ldBrandViolet-6)'
        : `rgba(${BRAND_VIOLET_RGB}, ${(0.07 + 0.55 * progress).toFixed(2)})`;
