import { colorsTuple } from '@mantine-8/core';
import {
    rem,
    type ColorScheme,
    type MantineThemeOverride,
    type Tuple,
} from '@mantine/core';

type ColorTuple = Tuple<string, 10>;

const lightModeColors = {
    background: colorsTuple('#FEFEFE') as ColorTuple,
    foreground: colorsTuple('#1A1B1E') as ColorTuple,

    ldDark: [
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
    ] as ColorTuple,

    ldGray: [
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
    ] as ColorTuple,
};

const darkModeColors = {
    background: colorsTuple('#1A1B1E') as ColorTuple,
    foreground: colorsTuple('#FEFEFE') as ColorTuple,

    ldDark: [
        '#101113',
        '#141517',
        '#1A1B1E',
        '#25262b',
        '#2C2E33',
        '#373A40',
        '#5c5f66',
        '#909296',
        '#A6A7AB',
        '#C1C2C5',
    ] as ColorTuple,
    ldGray: [
        '#28282c',
        '#343437',
        '#404044',
        '#4d4d4f',
        '#59595c',
        '#77777c',
        '#858588',
        '#949498',
        '#a2a2a7',
        '#b0b0bd',
    ] as ColorTuple,
};

// Colors used for conditional formatting in dark mode
export const DARK_MODE_COLORS = {
    SUBTLE_GRAY: darkModeColors.ldDark[4],
    CONTRAST_GRAY: darkModeColors.ldDark[6],
} as const;

export const getMantineThemeOverride = (
    colorScheme: ColorScheme,
    overrides?: {
        components?: Partial<MantineThemeOverride['components']>;
    },
) =>
    ({
        colorScheme,
        ...overrides,

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

        fontFamily: [
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

        lineHeight: 1.4,

        cursorType: 'pointer',

        shadows: {
            subtle: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)',
            heavy: '0px 12px 16px -4px rgba(10, 13, 18, 0.08), 0px 4px 6px -2px rgba(10, 13, 18, 0.03), 0px 2px 2px -1px rgba(10, 13, 18, 0.04)',
        },

        components: {
            Button: {
                variants: {
                    darkPrimary: (theme) => ({
                        root: {
                            background: `var(--mantine-color-foreground-0)`,
                            borderRadius: theme.radius.md,
                            color: `var(--mantine-color-ldGray-0)`,
                            boxShadow: `inset 0 -2px 0 0 color-mix(in srgb, var(--mantine-color-ldDark-0) 40%, transparent)`, // glossy effect
                            ...theme.fn.hover({
                                background: `color-mix(in srgb, var(--mantine-color-foreground-0) 80%, transparent)`,
                            }),
                            '&[data-loading]': {
                                boxShadow: theme.shadows.subtle,
                            },
                            '&[data-disabled]': {
                                boxShadow: theme.shadows.subtle,
                                color: `color-mix(in srgb, var(--mantine-color-foreground-0) 50%, transparent)`,
                            },
                        },
                    }),
                },
            },
            Kbd: {
                styles: (theme, _params) => ({
                    root: {
                        borderBottomWidth: theme.spacing.two,
                    },
                }),
            },

            Tooltip: {
                defaultProps: {
                    withArrow: true,
                },
                variants: {
                    xs: (theme) => ({
                        tooltip: {
                            fontSize: theme.fontSizes.xs,
                        },
                    }),
                },
            },

            Modal: {
                defaultProps: {
                    // FIXME: This makes the mantine modals line up exactly with the Blueprint ones.
                    // It could be made a less-magic number once we migrate
                    yOffset: 140,
                },
            },

            Alert: {
                styles: (_theme, _params) => ({
                    title: {
                        // FIXME: This makes the icon align with the title.
                        lineHeight: 1.55,
                    },
                }),
            },

            ScrollArea: {
                variants: {
                    primary: (theme) => ({
                        scrollbar: {
                            '&, &:hover': {
                                background: 'transparent',
                            },
                            '&[data-orientation="vertical"] .mantine-ScrollArea-thumb':
                                {
                                    backgroundColor: theme.colors.ldGray['5'],
                                },
                            '&[data-orientation="vertical"][data-state="visible"] .mantine-ScrollArea-thumb':
                                {
                                    // When visible, fade in
                                    animation: 'fadeIn 0.3s ease-in forwards',
                                },

                            '&[data-orientation="vertical"] .mantine-ScrollArea-thumb:hover':
                                {
                                    backgroundColor: theme.fn.darken(
                                        theme.colors.ldGray['5'],
                                        0.1,
                                    ),
                                },
                        },
                        viewport: {
                            '.only-vertical & > div': {
                                display: 'block !important', // Only way to override the display value (from `table`) of the Viewport's child element
                            },
                        },
                    }),
                },
            },
            ...overrides?.components,
        },

        other: {
            transitionTimingFunction: 'ease-in-out',
            transitionDuration: 200, // in ms
            chartFont: 'Inter, sans-serif',
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

        globalStyles: (theme) => ({
            ':root': {
                '--table-selected-bg':
                    theme.colorScheme === 'dark'
                        ? theme.colors.blue[9]
                        : '#ECF6FE',
                '--table-selected-border':
                    theme.colorScheme === 'dark'
                        ? theme.colors.blue[5]
                        : '#4170CB',
            },

            'html, body': {
                backgroundColor:
                    theme.colorScheme === 'dark'
                        ? theme.colors.ldDark[1]
                        : theme.colors.ldGray[0],
            },

            body: {
                fontSize: '14px',
            },

            p: {
                marginBottom: '10px',
                marginTop: 0,
            },

            b: {
                fontWeight: 'bold',
            },

            strong: {
                fontWeight: 600,
            },

            '.react-draggable.react-draggable-dragging .tile-base': {
                border: `1px solid ${theme.colors.blue[5]}`,
            },

            '.ace_editor.ace_autocomplete': {
                width: '500px',
            },
            '.ace_editor *': {
                fontFamily:
                    "Menlo, 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace",
            },
            '@keyframes fadeIn': {
                from: { opacity: 0 },
                to: { opacity: 1 },
            },
            ...(theme.colorScheme === 'dark'
                ? {
                      '[class*="mantine-"][data-with-border]': {
                          borderColor: theme.colors.ldDark[4],
                      },
                  }
                : undefined),
        }),
    } satisfies MantineThemeOverride);
