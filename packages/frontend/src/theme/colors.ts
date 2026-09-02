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

/**
 * The neutral ramp. One slightly cool gray, light-first (0 lightest → 9
 * darkest) like every Mantine color, so Mantine's derived variables
 * (`--mantine-color-gray-light`, `-outline`, …) behave in both schemes.
 *
 * Roles by index: 0 canvas · 1 muted fill / hover · 2 border · 3 strong
 * border / pressed fill · 4 faint icons, disabled text · 5 tertiary text,
 * placeholder · 6 secondary text (dimmed) · 7 labels · 8 near text · 9 text.
 */
const neutral = createColorTuple([
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
]);

/**
 * Mantine's dark-scheme chrome ramp (0 text → 9 deepest). Mantine reads fixed
 * indices from it: text 0, dimmed 2, placeholder 3, border 4, hover 5,
 * surface 6, canvas 7.
 */
const darkChrome = createColorTuple([
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
]);

/**
 * The neutral ramp expressed for the dark scheme with the same roles by
 * index as `neutral` (0 canvas → 9 text). `ldGray.N` therefore means the same
 * thing in both schemes, which is what makes `light-dark()` pairs unnecessary
 * for neutral chrome.
 */
const neutralDark = createColorTuple([
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
]);

/**
 * The primary color is the ink color: near-black on light, near-white on
 * dark. Each scheme's tuple is arranged so Mantine's default primary shades
 * (6 on light, 8 on dark) and the shades it derives from them (hover,
 * `light`, `outline`, `subtle`) all land on sensible values.
 */
const primaryLight = createColorTuple([
    '#f4f4f5',
    '#e4e4e7',
    '#d4d4d8',
    '#a1a1aa',
    '#71717a',
    '#3f3f46',
    '#18181b',
    '#2a2a2e',
    '#111113',
    '#09090b',
]);

const primaryDark = createColorTuple([
    '#3d3d42',
    '#55555c',
    '#72727a',
    '#d4d4d9',
    '#dcdce0',
    '#e4e4e7',
    '#e9e9ec',
    '#ececee',
    '#f4f4f5',
    '#e4e4e7',
]);

/**
 * Contrast ramp: 9 is the strongest contrast against the canvas in either
 * scheme (near-black on light, near-white on dark). Kept for the surfaces
 * that are deliberately inverted, e.g. tooltips and the AI launcher.
 */
const contrastLight = createColorTuple([
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
    primary: primaryLight,
    gray: neutral,
    ldGray: neutral,
    ldDark: contrastLight,

    /** Surface (cards, inputs, popovers) and text, as single-value ramps so
     *  they can be used anywhere a Mantine color token is accepted. */
    background: createColorTuple('#ffffff'),
    foreground: createColorTuple('#18181b'),

    ldBrandGray: lightdashBrandGray,
    ldBrandViolet: lightdashBrandViolet,
};

const darkModeColors = {
    primary: primaryDark,
    gray: neutral,
    dark: darkChrome,
    ldGray: neutralDark,
    ldDark: neutralDark,

    background: createColorTuple('#1e1e21'),
    foreground: createColorTuple('#ececee'),

    ldBrandGray: lightdashBrandGray,
    ldBrandViolet: lightdashBrandViolet,
};

export const getThemeColors = (colorScheme: ColorScheme) =>
    colorScheme === 'dark' ? darkModeColors : lightModeColors;

// Colors used for conditional formatting in dark mode
export const DARK_MODE_COLORS = {
    SUBTLE_GRAY: darkModeColors.ldDark[4],
    CONTRAST_GRAY: darkModeColors.ldDark[6],
} as const;
