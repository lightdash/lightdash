import { type MantineTheme } from '@mantine/core';
import { getMantineThemeOverride } from '../../mantineTheme';

export const themeOverride = getMantineThemeOverride({
    components: {
        Select: {
            styles: (theme) => ({
                label: {
                    fontSize: theme.fontSizes.xs,
                    fontWeight: 500,
                    color: theme.colors.gray['6'],
                },
            }),
            defaultProps: {
                size: 'xs',
            },
        },
        TextInput: {
            defaultProps: {
                size: 'xs',
            },
        },
        Switch: {
            styles: (theme) => ({
                label: {
                    fontSize: theme.fontSizes.xs,
                    fontWeight: 500,
                    color: theme.colors.gray['6'],
                    paddingLeft: 4,
                },
            }),
            defaultProps: {
                size: 'xs',
            },
        },
        SegmentedControl: {
            defaultProps: {
                size: 'xs',
            },
        },
        Button: {
            defaultProps: {
                size: 'xs',
            },
        },
        CloseButton: {
            defaultProps: {
                size: 'xs',
            },
        },
        NumberInput: {
            defaultProps: {
                size: 'xs',
            },
        },
        Checkbox: {
            styles: (theme) => ({
                label: {
                    fontSize: theme.fontSizes.xs,
                    fontWeight: 500,
                    color: theme.colors.gray['6'],
                    paddingLeft: 4,
                },
            }),
            defaultProps: {
                size: 'xs',
            },
        },
        ActionIcon: {
            defaultProps: {
                size: 'sm',
            },
        },
    },
});

export const getAccordionConfigTabsStyles = (theme: MantineTheme) => ({
    item: {
        borderBottom: `1px solid ${theme.colors.gray[2]}`,
        '&:first-of-type': {
            borderTop: `1px solid ${theme.colors.gray[2]}`,
        },
    },
    label: {
        padding: 0,
        fontSize: theme.fontSizes.sm,
        fontWeight: 500,
    },
    control: {
        padding: theme.spacing.xs,
        borderTop: `1px solid ${theme.colors.gray[0]}`,
        '&[aria-expanded="false"]': {
            backgroundColor: theme.colors.gray[0],
        },
    },
});
