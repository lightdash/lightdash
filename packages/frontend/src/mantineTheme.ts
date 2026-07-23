import {
    rem,
    type MantineColorsTuple,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { type LightdashColorScheme } from './providers/LightdashColorSchemeContext';

type ColorTuple = MantineColorsTuple;

const createColorTuple = (input: string | ColorTuple): ColorTuple => {
    if (typeof input === 'string') {
        return new Array(10).fill(input) as unknown as ColorTuple;
    }
    return input;
};

const lightdashDarkGray = createColorTuple([
    '#141414',
    '#1f1f1f',
    '#242424',
    '#2e2e2e',
    '#3b3b3b',
    '#525252',
    '#7a7a7a',
    '#9e9e9e',
    '#c8c8c8',
    '#d9d9d9',
]);

const lightModeColors = {
    background: createColorTuple('#FEFEFE'),
    foreground: createColorTuple('#1A1B1E'),

    ldDark: createColorTuple([
        '#C9C9C9',
        '#b8b8b8',
        '#828282',
        '#696969',
        '#424242',
        '#3b3b3b',
        '#2e2e2e',
        '#242424',
        '#1f1f1f',
        '#141414',
    ]),

    ldGray: createColorTuple([
        '#f8f9fa',
        '#f1f3f5',
        '#e9ecef',
        '#dee2e6',
        '#ced4da',
        '#adb5bd',
        '#868e96',
        '#495057',
        '#343a40',
        '#212529',
    ]),
};

const darkModeColors = {
    background: createColorTuple('#1a1a1a'),
    foreground: createColorTuple('#FEFEFE'),

    dark: createColorTuple([
        '#A1A1A1',
        '#939393',
        '#686868',
        '#545454',
        '#353535',
        '#292929',
        '#202020',
        '#191919',
        '#151515',
        '#0E0E0E',
    ]),

    ldDark: lightdashDarkGray,
    ldGray: lightdashDarkGray,
};

export const DARK_MODE_COLORS = {
    SUBTLE_GRAY: darkModeColors.ldDark[4],
    CONTRAST_GRAY: darkModeColors.ldDark[6],
} as const;

export interface LightdashFieldColors {
    bg: string;
    bgHover: string;
    color: string;
    columnHeaderColor: string;
    mantineColor: string;
}

export const LD_FIELD_COLORS = {
    dimension: {
        bg: 'light-dark(#EDF0FD, #202539)',
        bgHover: 'light-dark(#4b69ef28, #4b69ef35)',
        color: 'light-dark(#3b5bdb, #95aaf0)',
        columnHeaderColor: 'light-dark(#1c2b67, #93acff)',
        mantineColor: 'dimension',
    },
    metric: {
        bg: 'light-dark(#FBE9E0, #3E2F1A)',
        bgHover: 'light-dark(#e8590c30, #81510d75)',
        color: 'light-dark(#de7f0b, #e08a20)',
        columnHeaderColor: 'light-dark(#502e06, #de7f0b)',
        mantineColor: 'metric',
    },
    calculation: {
        bg: 'light-dark(#EBF5ED, #1D3525)',
        bgHover: 'light-dark(#2f9e4428, #23753565)',
        color: 'light-dark(#2b8a3e, #38af4d)',
        columnHeaderColor: 'light-dark(#1b5326, #48b95d)',
        mantineColor: 'calculation',
    },
    DEFAULT: {
        bg: 'var(--mantine-color-gray-light)',
        bgHover: 'var(--mantine-color-gray-light-hover)',
        color: 'var(--mantine-color-gray-light-color)',
        columnHeaderColor: 'var(--mantine-color-gray-light-color)',
        mantineColor: 'ldGray',
    },
} satisfies {
    dimension: LightdashFieldColors;
    metric: LightdashFieldColors;
    calculation: LightdashFieldColors;
    DEFAULT: LightdashFieldColors;
};

export const getMantineThemeOverride = (colorScheme: LightdashColorScheme) =>
    ({
        focusRing: 'auto',
        black: '#111418',
        colors: colorScheme === 'dark' ? darkModeColors : lightModeColors,
        spacing: {
            one: rem(1),
            two: rem(2),
            xxs: rem(4),
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
        },
        fontFamily: [
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
        ].join(', '),
        cursorType: 'pointer',
        shadows: {
            subtle: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)',
            heavy: '0px 12px 16px -4px rgba(10, 13, 18, 0.08), 0px 4px 6px -2px rgba(10, 13, 18, 0.03), 0px 2px 2px -1px rgba(10, 13, 18, 0.04)',
            bottomFade: '0 0 0 1px #bec1c426',
        },
        components: {},
        other: {
            transitionTimingFunction: 'ease-in-out',
            transitionDuration: 200,
            chartFont: 'Inter, sans-serif',
            ldField: LD_FIELD_COLORS,
            explorerItemBg: {
                dimension: {
                    light: '#d2dbe9',
                    dark: '#2a3f5f',
                },
                metric: {
                    light: '#e4dad0',
                    dark: '#4a3929',
                },
                calculation: {
                    light: '#d2dfd7',
                    dark: '#2a4a2f',
                },
            },
        },
    }) satisfies MantineThemeOverride;
