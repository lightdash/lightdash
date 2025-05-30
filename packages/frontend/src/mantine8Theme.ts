import {
    Button,
    Pill,
    ScrollArea,
    type MantineTheme,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { getMantineThemeOverride as getLegacyTheme } from './mantineTheme';

const { colors, components, ...legacyTheme } = getLegacyTheme();
const {
    Button: _Button,
    ScrollArea: _ScrollArea,
    ...legacyComponentsTheme
} = components;

export const getMantine8ThemeOverride = (
    overrides?: Partial<MantineThemeOverride>,
) =>
    ({
        ...legacyTheme,
        ...overrides,
        fontFamily: `Inter, ${legacyTheme.fontFamily}`,
        headings: {
            fontFamily: `Inter, ${legacyTheme.fontFamily}`,
            fontWeight: `600`,
        },
        components: {
            ...legacyComponentsTheme,
            Pill: Pill.extend({
                styles: (theme, props) =>
                    props.variant === 'outline'
                        ? {
                              root: {
                                  border: `1px solid ${theme.colors.gray[2]}`,
                                  color: theme.colors.gray[7],
                                  '&:hover': {
                                      backgroundColor: theme.colors.gray[1],
                                  },
                              },
                          }
                        : {},
            }),
            Button: Button.extend({
                styles: (theme) => ({
                    root: {
                        fontFamily: theme.fontFamily,
                        fontWeight: 500,
                        borderRadius: theme.radius.md,
                        border: `1px solid ${theme.colors.gray[2]}`,
                    },
                }),
                defaultProps: {
                    radius: 'md',
                },
            }),
            ScrollArea: ScrollArea.extend({
                defaultProps: {
                    variant: 'primary',
                    style: (theme) => ({
                        scrollbar: {
                            '&, &:hover': {
                                background: 'transparent',
                            },
                            '&[data-orientation="vertical"] .mantine-ScrollArea-thumb':
                                {
                                    backgroundColor: theme.colors.gray['5'],
                                },
                            '&[data-orientation="vertical"][data-state="visible"] .mantine-ScrollArea-thumb':
                                {
                                    // When visible, fade in
                                    animation: 'fadeIn 0.3s ease-in forwards',
                                },

                            // Missing hover state for vertical scrollbar thumb
                            // '&[data-orientation="vertical"] .mantine-ScrollArea-thumb:hover':
                            //     {
                            //         backgroundColor: theme.fn.darken(
                            //             theme.colors.gray['5'],
                            //             0.1,
                            //         ),
                            //     },
                        },
                        viewport: {
                            '.only-vertical & > div': {
                                display: 'block !important', // Only way to override the display value (from `table`) of the Viewport's child element
                            },
                        },
                    }),
                },
            }),
            Tooltip: {
                defaultProps: {
                    openDelay: 200,
                    withinPortal: true,
                    withArrow: true,
                    multiline: true,
                    maw: 250,
                    fz: 'xs',
                },
            },
            Popover: {
                defaultProps: {
                    withinPortal: true,
                    radius: 'md',
                    shadow: 'sm',
                },
            },
            Paper: {
                defaultProps: {
                    radius: 'md',
                    shadow: 'subtle',
                    withBorder: true,
                    sx: (theme: MantineTheme) => ({
                        '&[data-with-border]': {
                            border: `1px solid ${theme.colors.gray[2]}`,
                        },
                    }),
                },
            },
            ...overrides?.components,
        },
    } satisfies MantineThemeOverride);
