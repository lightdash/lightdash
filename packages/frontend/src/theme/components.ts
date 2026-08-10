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
    ScrollArea,
    Select,
    TagsInput,
    Textarea,
    TextInput,
    Tooltip,
    type MantineTheme,
    type MantineThemeOverride,
} from '@mantine/core';
import { DotsLoader } from '../ee/features/aiCopilot/components/ChatElements/DotsLoader/DotsLoader';
// eslint-disable-next-line css-modules/no-unused-class
import accordionStyles from '../styles/mantine-overrides/accordion.module.css';
// eslint-disable-next-line css-modules/no-unused-class
import tooltipStyles from '../styles/mantine-overrides/tooltip.module.css';

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

/** Scheme-independent component extensions: everything theme-dependent is
 *  resolved lazily through the styles/vars callbacks. */
export const themeComponents: MantineThemeOverride['components'] = {
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
                ...(props.variant === 'dotted' && paperDottedStyles(theme)),
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
            tooltip: tooltipStyles.tooltip,
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
                ...(props.variant === 'dotted' && paperDottedStyles(theme)),
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
            if (props.variant === 'subtle') return subtleInputStyles(theme);
            return {};
        },
    }),

    TextInput: TextInput.extend({
        defaultProps: {
            radius: 'md',
        },
        vars: (theme, props) => {
            if (props.variant === 'subtle') return subtleInputStyles(theme);
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
            props.variant === 'subtle' ? subtlePasswordInputStyles(theme) : {},
    }),

    Textarea: Textarea.extend({
        defaultProps: {
            radius: 'md',
        },
        vars: (theme, props) => {
            if (props.variant === 'subtle') return subtleInputStyles(theme);
            return {};
        },
    }),

    TagsInput: TagsInput.extend({
        vars: (theme, props) => {
            if (props.variant === 'subtle') return subtleInputStyles(theme);
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
            if (props.variant === 'subtle') return subtleInputStyles(theme);
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
};
