import {
    Button,
    Card,
    Loader,
    Pill,
    ScrollArea,
    Select,
    type ButtonVariant,
    type MantineTheme,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { DotsLoader } from './ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
import { getMantineThemeOverride as getLegacyTheme } from './mantineTheme';

const { colors, components, ...legacyTheme } = getLegacyTheme();
const {
    Button: _Button,
    ScrollArea: _ScrollArea,
    ...legacyComponentsTheme
} = components;

declare module '@mantine-8/core' {
    export interface ButtonProps {
        variant?: ButtonVariant | 'compact-outline' | 'dark';
    }
    export interface LoaderProps {
        /**
         * Displays a message after 8s. Only available when type='dots'
         */
        delayedMessage?: string;
    }
}

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
        spacing: {
            ...legacyTheme.spacing,
            xxs: `0.125rem`,
        },

        components: {
            ...legacyComponentsTheme,
            Card: Card.extend({
                styles: (theme) => ({
                    root: {
                        borderColor: theme.colors.gray[2],
                    },
                }),
            }),
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
                vars: (theme, props) => {
                    if (props.variant === 'compact-outline') {
                        return {
                            root: {
                                '--button-bd': `1px solid ${theme.colors.gray[2]}`,
                            },
                        };
                    }
                    if (props.variant === 'subtle') {
                        return {
                            root: {
                                '--button-color': theme.colors.gray[7],
                                '--button-hover': theme.colors.gray[1],
                            },
                        };
                    }
                    if (props.variant === 'dark') {
                        return {
                            root: {
                                '--button-bg': theme.colors.dark[9],
                                '--button-hover': theme.colors.dark[5],
                                '--button-color': theme.colors.gray[0],
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
                        borderRadius: theme.radius.md,
                    },
                }),
                defaultProps: {
                    radius: 'md',
                },
            }),
            ScrollArea: ScrollArea.extend({
                styles: (theme) => ({
                    thumb: {
                        backgroundColor: theme.colors.gray[3],
                    },
                    scrollbar: {
                        backgroundColor: `transparent`,
                    },
                }),
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
                    styles: (theme: MantineTheme) => ({
                        root: {
                            borderColor: theme.colors.gray[2],
                        },
                    }),
                },
            },
            Loader: Loader.extend({
                defaultProps: {
                    loaders: { ...Loader.defaultLoaders, dots: DotsLoader },
                },
            }),

            Select: Select.extend({
                defaultProps: {
                    radius: 'md',
                },
            }),
            ...overrides?.components,
        },
    } satisfies MantineThemeOverride);
