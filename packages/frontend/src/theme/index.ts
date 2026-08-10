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
    'Oxygen',
    'Ubuntu',
    'Cantarell',
    'Fira Sans',
    'Droid Sans',
    'Open Sans',
    'Helvetica Neue',
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'sans-serif',
].join(', ');

export const getMantineThemeOverride = (colorScheme: ColorScheme) =>
    ({
        focusRing: 'auto',

        //Black value from Blueprint. We could change this.
        // Without it things look a little darker than before.
        black: '#111418',

        colors: getThemeColors(colorScheme),

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

        fontFamily: FONT_FAMILY,
        headings: {
            fontFamily: FONT_FAMILY,
            fontWeight: `600`,
        },

        cursorType: 'pointer',

        shadows: {
            subtle: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)',
            heavy: '0px 12px 16px -4px rgba(10, 13, 18, 0.08), 0px 4px 6px -2px rgba(10, 13, 18, 0.03), 0px 2px 2px -1px rgba(10, 13, 18, 0.04)',
            bottomFade: '0 0 0 1px #bec1c426',
        },

        other: {
            transitionTimingFunction: 'ease-in-out',
            transitionDuration: 200, // in ms
            chartFont: 'Inter, sans-serif',
            ldField: LD_FIELD_COLORS,
        },

        components: themeComponents,
    }) satisfies MantineThemeOverride;
