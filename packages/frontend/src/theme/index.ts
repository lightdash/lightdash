import { rem, type MantineThemeOverride } from '@mantine/core';
import type {} from 'csstype';
import './augmentations';
import { getThemeColors, type ColorScheme } from './colors';
import { themeComponents } from './components';
import { LD_FIELD_COLORS } from './fieldColors';

export { DARK_MODE_COLORS, type ColorScheme } from './colors';
export { LD_FIELD_COLORS, type LightdashFieldColors } from './fieldColors';

const FONT_FAMILY = [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
    'Apple Color Emoji',
    'Segoe UI Emoji',
].join(', ');

const FONT_FAMILY_MONOSPACE = [
    'ui-monospace',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
    'Liberation Mono',
    'monospace',
].join(', ');

/** Shadows are near-invisible ink on light and heavier on dark, where the
 *  border does most of the separating and the shadow only adds depth. */
const shadowColor = (light: number, dark: number) =>
    `light-dark(rgb(9 9 11 / ${light}), rgb(0 0 0 / ${dark}))`;

const SHADOWS = {
    xs: `0 ${rem(1)} ${rem(2)} 0 ${shadowColor(0.05, 0.4)}`,
    sm: `0 ${rem(1)} ${rem(2)} ${shadowColor(0.04, 0.3)}, 0 ${rem(2)} ${rem(8)} ${rem(-2)} ${shadowColor(0.06, 0.5)}`,
    md: `0 ${rem(1)} ${rem(2)} ${shadowColor(0.04, 0.3)}, 0 ${rem(8)} ${rem(24)} ${rem(-6)} ${shadowColor(0.1, 0.6)}`,
    lg: `0 ${rem(2)} ${rem(4)} ${shadowColor(0.04, 0.3)}, 0 ${rem(16)} ${rem(40)} ${rem(-8)} ${shadowColor(0.14, 0.7)}`,
    xl: `0 ${rem(4)} ${rem(8)} ${shadowColor(0.04, 0.3)}, 0 ${rem(24)} ${rem(64)} ${rem(-12)} ${shadowColor(0.18, 0.8)}`,
};

export const getMantineThemeOverride = (colorScheme: ColorScheme) =>
    ({
        focusRing: 'auto',
        cursorType: 'pointer',
        white: '#ffffff',
        black: '#18181b',

        colors: getThemeColors(colorScheme),
        primaryColor: 'primary',
        primaryShade: { light: 6, dark: 8 },
        // Filled surfaces pick black or white text from their luminance, so
        // the near-white dark-scheme primary reads correctly.
        autoContrast: true,

        defaultRadius: 'md',
        radius: {
            xs: rem(4),
            sm: rem(6),
            md: rem(8),
            lg: rem(12),
            xl: rem(32),
        },

        spacing: {
            one: rem(1),
            two: rem(2),
            xxs: rem(2),
            xs: rem(8),
            sm: rem(12),
            md: rem(16),
            lg: rem(20),
            xl: rem(24),
            xxl: rem(32),
            '3xl': rem(40),
            '4xl': rem(48),
            '5xl': rem(64),
            '6xl': rem(80),
            '7xl': rem(96),
            '8xl': rem(128),
            '9xl': rem(160),
            // Large padding for page bottoms to allow scrolling past last elements
            emptySpace: '6rem',
        },

        fontFamily: FONT_FAMILY,
        fontFamilyMonospace: FONT_FAMILY_MONOSPACE,

        // Mantine's defaults restated because this key is replaced, not merged.
        // `display` is the only addition: a hero size above the h1 scale.
        fontSizes: {
            xs: rem(12),
            sm: rem(14),
            md: rem(16),
            lg: rem(18),
            xl: rem(20),
            display: rem(48),
        },
        // Each step lands on the 4px grid: 16, 20, 24, 26, 28px.
        lineHeights: {
            xs: '1.3334',
            sm: '1.4286',
            md: '1.5',
            lg: '1.4445',
            xl: '1.4',
        },

        headings: {
            fontFamily: FONT_FAMILY,
            fontWeight: '600',
            sizes: {
                h1: { fontSize: rem(28), lineHeight: '1.2' },
                h2: { fontSize: rem(24), lineHeight: '1.25' },
                h3: { fontSize: rem(20), lineHeight: '1.3' },
                h4: { fontSize: rem(18), lineHeight: '1.35' },
                h5: { fontSize: rem(16), lineHeight: '1.4' },
                h6: { fontSize: rem(14), lineHeight: '1.45' },
            },
        },

        shadows: {
            ...SHADOWS,
            // Aliases kept for existing call sites. Surfaces are flat: a
            // hairline border does the separating, so `subtle` is no shadow.
            subtle: 'none',
            heavy: SHADOWS.lg,
            bottomFade: `0 ${rem(1)} 0 0 var(--mantine-color-default-border)`,
        },

        other: {
            transitionTimingFunction: 'ease-in-out',
            transitionDuration: 200, // in ms
            chartFont: 'Inter, sans-serif',
            ldField: LD_FIELD_COLORS,
        },

        components: themeComponents,
    }) satisfies MantineThemeOverride;
