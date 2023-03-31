import { createStyles } from '@mantine/core';

export const useStyles = createStyles((theme) => ({
    table: {
        '& td, & th': {
            whiteSpace: 'nowrap',
        },

        td: {
            transition: 'background-color 0.2s ease-in-out',
        },

        'td[data-expanded="true"]': {
            backgroundColor: theme.colors.blue[0],
        },

        'td[data-copied="true"]': {
            backgroundColor: theme.colors.blue[1],
        },
    },
    header: {
        fontWeight: 'bold',
        backgroundColor: theme.colors.gray[0],
    },
}));
