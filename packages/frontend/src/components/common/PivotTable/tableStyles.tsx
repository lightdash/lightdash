import { createStyles } from '@mantine/core';

export const useStyles = createStyles((theme) => ({
    table: {
        'td, th': {
            whiteSpace: 'nowrap',
        },
    },
    td: {
        transitionProperty: 'color, background-color, border-color',
        transitionDuration: '100ms',
        transitionTimingFunction: 'ease-in-out',
    },

    tbody: {
        'tr:hover': {
            td: {
                '&:not([data-conditional-formatting="true"]):not([data-expanded="true"])':
                    {
                        backgroundColor: theme.colors.gray[1],
                    },
            },
        },
    },

    header: {
        fontWeight: 600,
        backgroundColor: theme.colors.gray[0],
    },

    rowNumberColumn: {
        width: '1%',
        textAlign: 'right',
    },
}));
