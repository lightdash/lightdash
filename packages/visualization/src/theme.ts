/**
 * The handful of theme values the chart builders read.
 *
 * The frontend fills this from its Mantine theme; a headless caller uses
 * `LIGHT_VISUALIZATION_THEME` or `DARK_VISUALIZATION_THEME`. Colors are plain
 * hex values: they end up inside ECharts options that may be rasterised with
 * no stylesheet, so CSS variables would not resolve.
 */
export type VisualizationTheme = {
    colorScheme: 'light' | 'dark';
    /** Page background: tooltips, label halos, mark line label backgrounds. */
    background: string;
    /** Default ink color. */
    foreground: string;
    /** Neutral ramp, 0 lightest to 9 darkest (`ldGray` in the frontend theme). */
    gray: readonly string[];
    /** Contrast ramp used by gauges (`ldDark` in the frontend theme). */
    dark: readonly string[];
    /** Blue ramp used by gauge progress. */
    blue: readonly string[];
    /** Font stack for chart text. */
    chartFont: string;
    /** Extra small spacing in px; tooltip padding. */
    spacingXs: number;
    /** Box shadow of floating chart tooltips. */
    shadowSubtle: string;
};

const MANTINE_BLUE = [
    '#e7f5ff',
    '#d0ebff',
    '#a5d8ff',
    '#74c0fc',
    '#4dabf7',
    '#339af0',
    '#228be6',
    '#1c7ed6',
    '#1971c2',
    '#1864ab',
] as const;

export const LIGHT_VISUALIZATION_THEME: VisualizationTheme = {
    colorScheme: 'light',
    background: '#ffffff',
    foreground: '#18181b',
    gray: [
        '#fafafa',
        '#f4f4f5',
        '#ebebee',
        '#dcdce0',
        '#a1a1aa',
        '#8e8e97',
        '#71717a',
        '#52525b',
        '#3f3f46',
        '#18181b',
    ],
    dark: [
        '#e4e4e7',
        '#d4d4d8',
        '#a1a1aa',
        '#71717a',
        '#52525b',
        '#3f3f46',
        '#333338',
        '#27272a',
        '#232326',
        '#18181b',
    ],
    blue: MANTINE_BLUE,
    chartFont: 'Inter, sans-serif',
    spacingXs: 10,
    shadowSubtle: 'none',
};

export const DARK_VISUALIZATION_THEME: VisualizationTheme = {
    colorScheme: 'dark',
    background: '#141417',
    foreground: '#ececee',
    gray: [
        '#151517',
        '#232326',
        '#303034',
        '#3d3d42',
        '#55555c',
        '#72727a',
        '#9a9aa3',
        '#b9b9c0',
        '#d4d4d9',
        '#ececee',
    ],
    dark: [
        '#151517',
        '#232326',
        '#303034',
        '#3d3d42',
        '#55555c',
        '#72727a',
        '#9a9aa3',
        '#b9b9c0',
        '#d4d4d9',
        '#ececee',
    ],
    blue: MANTINE_BLUE,
    chartFont: 'Inter, sans-serif',
    spacingXs: 10,
    shadowSubtle: 'none',
};
