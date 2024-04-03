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
