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
    /** Neutral ramp, 0 lightest to 9 darkest: axis lines, labels, borders (`ldGray` in the frontend theme). */
    neutral: readonly string[];
    /** Contrast ramp, 0 lightest to 9 darkest: gauge badges (`ldDark` in the frontend theme). */
    contrast: readonly string[];
    /** The app chrome ramp in dark mode (`dark` in the frontend theme): gauge section borders. */
    chrome: readonly string[];
    /** Accent ramp: gauge progress. */
    accent: readonly string[];
    /** Font stack for chart text. */
    chartFont: string;
    /** Horizontal padding of floating chart tooltips, in px. */
    tooltipPadding: number;
    /** Box shadow of floating chart tooltips. */
    tooltipShadow: string;
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

const DARK_CHROME = [
    '#ececee',
    '#c4c4c9',
    '#9a9aa3',
    '#72727a',
    '#303034',
    '#26262a',
    '#1e1e21',
    '#151517',
    '#0f0f11',
    '#0a0a0c',
] as const;

export const LIGHT_VISUALIZATION_THEME: VisualizationTheme = {
    colorScheme: 'light',
    background: '#ffffff',
    foreground: '#18181b',
    neutral: [
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
    contrast: [
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
    accent: MANTINE_BLUE,
    chrome: DARK_CHROME,
    chartFont: 'Inter, sans-serif',
    tooltipPadding: 10,
    tooltipShadow: 'none',
};

export const DARK_VISUALIZATION_THEME: VisualizationTheme = {
    colorScheme: 'dark',
    background: '#141417',
    foreground: '#ececee',
    neutral: [
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
    contrast: [
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
    accent: MANTINE_BLUE,
    chrome: DARK_CHROME,
    chartFont: 'Inter, sans-serif',
    tooltipPadding: 10,
    tooltipShadow: 'none',
};
