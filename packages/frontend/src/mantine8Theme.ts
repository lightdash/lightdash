import {
    Button,
    Card,
    Loader,
    Modal,
    MultiSelect,
    Pill,
    ScrollArea,
    Select,
    TagsInput,
    Textarea,
    TextInput,
    type ButtonVariant,
    type DefaultMantineColor,
    type MantineColorsTuple,
    type MantineTheme,
    type MantineThemeOverride,
} from '@mantine-8/core';
import { type ColorScheme } from '@mantine/styles';
import { DotsLoader } from './ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
import { getMantineThemeOverride as getMantine6ThemeOverride } from './mantineTheme';

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

    export interface MantineThemeColorsOverride {
        colors: Record<ExtendedCustomColors, MantineColorsTuple>;
    }
}

type ExtendedCustomColors = 'ldGray' | 'ldDark' | DefaultMantineColor;

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

export const getMantine8ThemeOverride = (
    colorScheme: ColorScheme,
    overrides?: Partial<MantineThemeOverride>,
) => {
    const { colors, components, ...legacyTheme } =
        getMantine6ThemeOverride(colorScheme);

    const {
        Button: _Button,
        ScrollArea: _ScrollArea,
        ...legacyComponentsTheme
    } = components;

    return {
        ...legacyTheme,
        ...overrides,
        colors,
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
                        borderColor: theme.colors.ldGray[2],
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
                                '--button-color': theme.colors.ldDark[0],
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
                        backgroundColor: theme.colors.ldGray[3],
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
                            borderColor: theme.colors.ldGray[2],
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

            Textarea: Textarea.extend({
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
                        borderBottom: `1px solid var(--mantine-color-ldGray-4)`,
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
