export type ColorScheme = 'light' | 'dark';

type ColorTuple = [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
];

const createColorTuple = (input: string | ColorTuple): ColorTuple => {
    if (typeof input === 'string') {
        return new Array(10).fill(input) as ColorTuple;
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

/** Lightdash brand ramps, matching lightdash.com. Identical in both colour
 *  schemes: the surfaces they style are always dark. */
const lightdashBrandGray = createColorTuple([
    '#f8fafb',
    '#eceff3',
    '#dfe1e7',
    '#c1c7d0',
    '#a4acb9',
    '#818898',
    '#666d80',
    '#36394a',
    '#1a1b25',
    '#0d0d12',
]);

const lightdashBrandViolet = createColorTuple([
    '#efedff',
    '#dcd8ff',
    '#c8c2ff',
    '#b4acff',
    '#9a8fff',
    '#7c6dff',
    '#5e4cff',
    '#4c3ddb',
    '#3d31af',
    '#2e2585',
]);

const lightModeColors = {
    background: createColorTuple('#FEFEFE'),
    foreground: createColorTuple('#1A1B1E'),

    ldBrandGray: lightdashBrandGray,
    ldBrandViolet: lightdashBrandViolet,

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

    ldBrandGray: lightdashBrandGray,
    ldBrandViolet: lightdashBrandViolet,

    /** Overwrite Mantine's dark colors because they are too light */
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

    /** Make both light and dark the same shades to avoid clashing different tones. */
    ldDark: lightdashDarkGray,
    ldGray: lightdashDarkGray,
};

export const getThemeColors = (colorScheme: ColorScheme) =>
    colorScheme === 'dark' ? darkModeColors : lightModeColors;

// Colors used for conditional formatting in dark mode
export const DARK_MODE_COLORS = {
    SUBTLE_GRAY: darkModeColors.ldDark[4],
    CONTRAST_GRAY: darkModeColors.ldDark[6],
} as const;
