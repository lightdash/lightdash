import { createStyles } from '@mantine/core';

export const usePillSelectStyles = createStyles(
    (
        theme,
        {
            backgroundColor = theme.colors.ldGray[2],
            textColor = theme.colors.ldGray[7],
            hoverColor,
        }: {
            backgroundColor?: string;
            textColor?: string;
            hoverColor?: string;
        } = {},
    ) => {
        const modeFn =
            theme.colorScheme === 'dark' ? theme.fn.darken : theme.fn.lighten;

        return {
            input: {
                height: '24px',
                minHeight: '24px',
                padding: 0,
                textAlign: 'center',
                fontWeight: 500,
                border: 'none',
                borderRadius: theme.radius.sm,
                fontSize: '13px',
                backgroundColor: modeFn(backgroundColor, 0.5),
                color: textColor,
                '&:hover': {
                    backgroundColor: hoverColor || modeFn(backgroundColor, 0.1),
                },
                '&[data-with-icon]': {
                    padding: 0,
                    paddingLeft: '16px',
                },
                marginRight: '6px',
            },
            inputUnsetValue: {
                color: modeFn(textColor, 0.5),
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
                    backgroundColor: modeFn(backgroundColor, 0.1),
                },
                '&[data-selected="true"]:hover': {
                    backgroundColor: hoverColor || modeFn(backgroundColor, 0.3),
                },
            },
        };
    },
);
