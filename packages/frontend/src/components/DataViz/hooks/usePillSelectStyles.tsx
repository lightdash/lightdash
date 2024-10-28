import { createStyles } from '@mantine/core';

export const usePillSelectStyles = createStyles(
    (
        theme,
        {
            backgroundColor = theme.colors.gray[2],
            textColor = theme.colors.gray[7],
            hoverColor,
        }: {
            backgroundColor?: string;
            textColor?: string;
            hoverColor?: string;
        } = {},
    ) => ({
        input: {
            height: '24px',
            minHeight: '24px',
            padding: 0,
            textAlign: 'center',
            fontWeight: 500,
            border: 'none',
            borderRadius: theme.radius.sm,
            fontSize: '13px',
            backgroundColor: theme.fn.lighten(backgroundColor, 0.5),
            color: textColor,
            '&:hover': {
                backgroundColor:
                    hoverColor || theme.fn.lighten(backgroundColor, 0.1),
            },
            '&[data-with-icon]': {
                padding: 0,
                paddingLeft: '16px',
            },
            marginRight: '6px',
        },
        inputUnsetValue: {
            color: theme.fn.lighten(textColor, 0.5),
        },
        rightSection: {
            display: 'none',
        },
        dropdown: {
            minWidth: 'fit-content',
        },
        item: {
            '&[data-selected="true"]': {
                color: textColor,
                fontWeight: 500,
                backgroundColor: theme.fn.lighten(backgroundColor, 0.5),
            },
            '&[data-selected="true"]:hover': {
                backgroundColor:
                    hoverColor || theme.fn.lighten(backgroundColor, 0.3),
            },
            '&:hover': {
                backgroundColor: theme.fn.lighten(backgroundColor, 0.7),
            },
        },
    }),
);
