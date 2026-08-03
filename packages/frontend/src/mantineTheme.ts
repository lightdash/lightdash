import {
    Accordion,
    Badge,
    Button,
    Card,
    Loader,
    Menu,
    Modal,
    MultiSelect,
    NumberInput,
    Paper,
    PasswordInput,
    Pill,
    PillsInput,
    rem,
    ScrollArea,
    Select,
    TagsInput,
    Textarea,
    TextInput,
    Tooltip,
    type ButtonVariant,
    type DefaultMantineColor,
    type MantineColorsTuple,
    type MantineTheme,
    type MantineThemeOverride,
} from '@mantine/core';
import type {} from 'csstype';
import { DotsLoader } from './ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
// eslint-disable-next-line css-modules/no-unused-class
import accordionStyles from './styles/mantine-overrides/accordion.module.css';
// eslint-disable-next-line css-modules/no-unused-class
import styles from './styles/mantine-overrides/tooltip.module.css';

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

// Colors used for conditional formatting in dark mode
export const DARK_MODE_COLORS = {
    SUBTLE_GRAY: darkModeColors.ldDark[4],
    CONTRAST_GRAY: darkModeColors.ldDark[6],
} as const;

export interface LightdashFieldColors {
    /** CSS variable for background color (auto-switches for dark/light modes) */
    bg: string;
    /** CSS variable for hover background color */
    bgHover: string;
    /** CSS variable for text color */
    color: string;
    /** CSS variable for column header text color */
    columnHeaderColor: string;
    /** Mantine color token for component color property */
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

const getBaseThemeOverride = (colorScheme: ColorScheme) =>
    ({
        focusRing: 'auto',

        //Black value from Blueprint. We could change this.
        // Without it things look a little darker than before.
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

        components: {
            Kbd: {
                styles: (theme: MantineTheme) => ({
                    root: {
                        borderBottomWidth: theme.spacing.two,
                    },
                }),
            },

            Alert: {
                styles: () => ({
                    title: {
                        // FIXME: This makes the icon align with the title.
                        lineHeight: 1.55,
                    },
                }),
            },
        },

        other: {
            transitionTimingFunction: 'ease-in-out',
            transitionDuration: 200, // in ms
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

declare module '@mantine/core' {
    interface AccordionProps {
        // When true, the active item won't get the variant's filled background.
        transparentActiveItem?: boolean;
    }
}

declare module '@mantine/core' {
    export interface ButtonProps {
        variant?: ButtonVariant | 'compact-outline' | 'dark';
    }

    export interface PaperProps {
        variant?: 'dotted';
    }

    export interface LoaderProps {
        /**
         * Displays a message after 8s. Only available when type='dots'
         */
        delayedMessage?: string;
    }

    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>;
    }
}

type ExtendedCustomColors =
    | 'ldGray'
    | 'ldDark'
    | 'ldBrandGray'
    | 'ldBrandViolet'
    | DefaultMantineColor;

const subtleInputStyles = (theme: MantineTheme) => ({
    input: {
        fontWeight: 500,
        fontSize: 14,
        '--input-bd': theme.colors.ldGray[2],
        borderRadius: theme.radius.md,
        boxShadow: theme.shadows.subtle,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        color: theme.colors.ldGray[7],
    },
    label: {
        fontWeight: 500,
        color: theme.colors.ldGray[7],
        marginBottom: theme.spacing.xxs,
    },
    pill: {
        background: theme.colors.ldGray[1],
        color: theme.colors.ldGray[9],
    },
});

const subtlePasswordInputStyles = (theme: MantineTheme) => {
    const subtleStyles = subtleInputStyles(theme);

    return {
        input: {
            '--input-bd': theme.colors.ldGray[2],
            borderRadius: theme.radius.md,
            boxShadow: theme.shadows.subtle,
        },
        innerInput: {
            fontWeight: subtleStyles.input.fontWeight,
            fontSize: subtleStyles.input.fontSize,
            color: subtleStyles.input.color,
        },
        label: subtleStyles.label,
    };
};

const paperDottedStyles = (theme: MantineTheme) => ({
    border: `1px dashed ${theme.colors.ldGray[3]}`,
    background: 'inherit',
});

export const getMantineThemeOverride = (
    colorScheme: ColorScheme,
    overrides?: Partial<MantineThemeOverride>,
) => {
    const {
        colors,
        components: baseComponentsTheme,
        ...baseTheme
    } = getBaseThemeOverride(colorScheme);

    return {
        ...baseTheme,
        ...overrides,
        colors,
        fontFamily: `Inter, ${baseTheme.fontFamily}`,
        headings: {
            fontFamily: `Inter, ${baseTheme.fontFamily}`,
            fontWeight: `600`,
        },
        spacing: {
            ...baseTheme.spacing,
            xxs: `0.125rem`,
            // Large padding for page bottoms to allow scrolling past last elements
            emptySpace: `6rem`,
        },

        components: {
            ...baseComponentsTheme,
            Accordion: Accordion.extend({
                classNames: (_theme, props) =>
                    props.transparentActiveItem
                        ? { item: accordionStyles.transparentActiveItem }
                        : {},
            }),
            Badge: Badge.extend({
                defaultProps: {
                    radius: 'sm',
                },
                styles: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 400,
                    },
                },
            }),
            Card: Card.extend({
                styles: (theme, props) => ({
                    root: {
                        borderColor: theme.colors.ldGray[2],
                        ...(props.variant === 'dotted' &&
                            paperDottedStyles(theme)),
                    },
                }),
            }),
            Pill: Pill.extend({
                styles: (theme, props) =>
                    props.variant === 'outline'
                        ? {
                              root: {
                                  border: `1px solid ${theme.colors.ldGray[2]}`,
                                  color: theme.colors.ldGray[7],
                                  '&:hover': {
                                      backgroundColor: theme.colors.ldGray[1],
                                  },
                              },
                          }
                        : {},
            }),
            Button: Button.extend({
                vars: (theme, props) => {
                    if (props.variant === 'compact-outline') {
                        return {
                            root: {
                                '--button-bd': `1px solid ${theme.colors.ldGray[2]}`,
                            },
                        };
                    }
                    if (props.variant === 'subtle') {
                        return {
                            root: {
                                '--button-color': theme.colors.ldGray[7],
                                '--button-hover': theme.colors.ldGray[1],
                            },
                        };
                    }
                    if (props.variant === 'dark') {
                        return {
                            root: {
                                '--button-bg': theme.colors.ldDark[9],
                                '--button-hover': theme.colors.ldDark[8],
                                '--button-color': theme.colors.ldGray[0],
                                '--button-bd': `none`,
                            },
                        };
                    }
                    return { root: {} };
                },
                styles: (theme) => ({
                    root: {
                        fontFamily: theme.fontFamily,
                        fontWeight: 500,
                    },
                }),
                defaultProps: {
                    radius: 'md',
                    variant: 'dark',
                },
            }),
            ScrollArea: ScrollArea.extend({
                styles: (theme) => ({
                    thumb: {
                        backgroundColor: theme.colors.ldGray[3],
                    },
                    scrollbar: {
                        backgroundColor: `transparent`,
                    },
                }),
            }),
            Tooltip: Tooltip.extend({
                classNames: {
                    tooltip: styles.tooltip,
                },
                defaultProps: {
                    openDelay: 200,
                    withinPortal: true,
                    withArrow: true,
                    multiline: true,
                    maw: 250,
                    fz: 'xs',
                },
            }),
            Popover: {
                defaultProps: {
                    withinPortal: true,
                    radius: 'md',
                    shadow: 'sm',
                },
            },
            Paper: Paper.extend({
                defaultProps: {
                    radius: 'md',
                    shadow: 'subtle',
                    withBorder: true,
                },
                styles: (theme, props) => ({
                    root: {
                        borderColor: `var(--mantine-color-ldGray-2)`,
                        ...(props.variant === 'dotted' &&
                            paperDottedStyles(theme)),
                    },
                }),
            }),
            Loader: Loader.extend({
                defaultProps: {
                    loaders: { ...Loader.defaultLoaders, dots: DotsLoader },
                },
            }),

            Menu: Menu.extend({
                styles: (theme) => ({
                    dropdown: { fontFamily: theme.fontFamily },
                    item: { fontFamily: theme.fontFamily },
                }),
            }),

            Select: Select.extend({
                defaultProps: {
                    radius: 'md',
                },
                styles: (theme) => ({
                    input: { fontFamily: theme.fontFamily },
                    option: { fontFamily: theme.fontFamily },
                    groupLabel: { fontFamily: theme.fontFamily },
                }),
                vars: (theme, props) => {
                    if (props.variant === 'subtle')
                        return subtleInputStyles(theme);
                    return {};
                },
            }),

            TextInput: TextInput.extend({
                defaultProps: {
                    radius: 'md',
                },
                vars: (theme, props) => {
                    if (props.variant === 'subtle')
                        return subtleInputStyles(theme);
                    return {};
                },
            }),

            NumberInput: NumberInput.extend({
                defaultProps: {
                    radius: 'md',
                },
            }),

            PasswordInput: PasswordInput.extend({
                defaultProps: {
                    radius: 'md',
                },
                styles: (theme, props) =>
                    props.variant === 'subtle'
                        ? subtlePasswordInputStyles(theme)
                        : {},
            }),

            Textarea: Textarea.extend({
                defaultProps: {
                    radius: 'md',
                },
                vars: (theme, props) => {
                    if (props.variant === 'subtle')
                        return subtleInputStyles(theme);
                    return {};
                },
            }),
            TagsInput: TagsInput.extend({
                vars: (theme, props) => {
                    if (props.variant === 'subtle')
                        return subtleInputStyles(theme);
                    return {};
                },
            }),
            PillsInput: PillsInput.extend({
                vars: (theme, props) => {
                    if (props.variant === 'subtle') {
                        return subtleInputStyles(theme);
                    }
                    return {};
                },
            }),
            MultiSelect: MultiSelect.extend({
                vars: (theme, props) => {
                    if (props.variant === 'subtle')
                        return subtleInputStyles(theme);
                    return {};
                },
                defaultProps: {
                    radius: 'md',
                },
            }),
            Modal: Modal.extend({
                styles: () => ({
                    header: {
                        paddingBottom: 'var(--mantine-spacing-sm)',
                    },
                    body: {
                        paddingTop: 'var(--mantine-spacing-sm)',
                    },
                }),
            }),
            ...overrides?.components,
        },
    } satisfies MantineThemeOverride;
};
