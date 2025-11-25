import {
    rem,
    type ColorScheme,
    type MantineThemeOverride,
    type Tuple,
} from '@mantine/core';

type ColorTuple = Tuple<string, 10>;

const lightModeColors = {
    background: [
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
    ] as ColorTuple,
    foreground: [
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
    ] as ColorTuple,

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
    background: [
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
        '#1A1B1E',
    ] as ColorTuple,
    foreground: [
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
        '#FEFEFE',
    ] as ColorTuple,

    ldDark: [
        '#f5f5f5',
        '#e8e8e8',
        '#d1d1d1',
        '#b8b8b8',
        '#9e9e9e',
        '#858585',
        '#6c6c6c',
        '#545454',
        '#3c3c3c',
        '#242424',
    ] as ColorTuple,
    ldGray: [
        '#2e2e2e',
        '#3b3b3b',
        '#424242',
        '#4a4a4a',
        '#5a5a5a',
        '#6e6e6e',
        '#8a8a8a',
        '#a8a8a8',
        '#c4c4c4',
        '#d9d9d9',
    ] as ColorTuple,
};

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
                            background: `var(--mantine-color-ldDark-9)`,
                            borderRadius: theme.radius.md,
                            color: `var(--mantine-color-ldDark-0)`,
                            ...theme.fn.hover({
                                background: `var(--mantine-color-ldDark-8)`,
                            }),
                            '&[data-loading]': {
                                boxShadow: theme.shadows.subtle,
                            },
                            '&[data-disabled]': {
                                boxShadow: theme.shadows.subtle,
                                color: `var(--mantine-color-ldDark-5)`,
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

            Popover: {
                defaultProps: {
                    withinPortal: true,
                    radius: 'md',
                    shadow: 'md',
                },
            },

            Tooltip: {
                defaultProps: {
                    withArrow: true,
                    withinPortal: true,
                    multiline: true,
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

            Paper: {
                defaultProps: {
                    radius: 'md',
                    shadow: 'subtle',
                    withBorder: true,
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
                backgroundColor: theme.colors.ldGray[0],
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
        }),
    }) satisfies MantineThemeOverride;
