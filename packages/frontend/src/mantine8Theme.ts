import {
    Badge,
    Button,
    Card,
    Loader,
    Modal,
    MultiSelect,
    NumberInput,
    Paper,
    PasswordInput,
    Pill,
    PillsInput,
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
} from '@mantine-8/core';
import { type ColorScheme } from '@mantine/styles';
import { DotsLoader } from './ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
import { getMantineThemeOverride as getMantine6ThemeOverride } from './mantineTheme';
// eslint-disable-next-line css-modules/no-unused-class
import styles from './styles/mantine-overrides/tooltip.module.css';

declare module '@mantine-8/core' {
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

const paperDottedStyles = (theme: MantineTheme) => ({
    border: `1px dashed ${theme.colors.ldGray[3]}`,
    background: 'inherit',
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
            // Large padding for page bottoms to allow scrolling past last elements
            emptySpace: `6rem`,
        },

        components: {
            ...legacyComponentsTheme,
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
                                '--button-color': 'var(--mantine-color-white)',
                                '--button-bd': 'none',
                            },
                        };
                    }
                    return { root: {} };
                },
                styles: (theme, props) => {
                    const base = {
                        fontFamily: theme.fontFamily,
                        fontWeight: 500,
                    };
                    if (props.variant === 'dark') {
                        return {
                            root: {
                                ...base,
                                color: 'light-dark(var(--mantine-color-ldGray-0), var(--mantine-color-ldDark-9)) !important',
                                backgroundColor: 'transparent',
                                backgroundImage:
                                    'linear-gradient(180deg,light-dark(#201E25, #252527) 0%, light-dark(#323137, #222125) 100%)',
                                boxShadow: [
                                    'rgb(63, 62, 62) 0px 0px 0px 1px inset',
                                    'inset 0 -1px 0 #313036',
                                    '0 0 0 1px #0D0D0D',
                                    '0 2px 4px rgba(0, 0, 0, 0.1)',
                                ].join(', '),
                                '&:hover': {
                                    backgroundColor: 'transparent',
                                    backgroundImage:
                                        'linear-gradient(180deg, #2A2830 0%, #3C3B41 100%)',
                                },
                                '&:active': {
                                    backgroundColor: 'transparent',
                                    backgroundImage:
                                        'linear-gradient(180deg, #1A1820 0%, #2C2B32 100%)',
                                    boxShadow: [
                                        'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
                                        '0 0 0 1px #0D0D0D',
                                        '0 2px 4px rgba(0, 0, 0, 0.1)',
                                    ].join(', '),
                                },
                                '&:disabled, &[data-disabled]': {
                                    backgroundColor: '#2A2830',
                                    backgroundImage: 'none',
                                    boxShadow: '0 0 0 1px #0D0D0D',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                },
                            },
                        };
                    }
                    return { root: base };
                },
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

            NumberInput: NumberInput.extend({
                defaultProps: {
                    radius: 'md',
                },
            }),

            PasswordInput: PasswordInput.extend({
                defaultProps: {
                    radius: 'md',
                },
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
