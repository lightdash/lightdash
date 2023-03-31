import { createStyles } from '@mantine/core';

export const useStyles = createStyles((theme) => ({
    table: {
        '& td, & th': {
            whiteSpace: 'nowrap',
        },

        'td[data-expanded="true"]': {
            backgroundColor: theme.colors.blue[0],
        },

        'td[data-copied="true"]': {
            backgroundColor: theme.colors.green[0],
        },
    },
    header: {
        fontWeight: 'bold',
        backgroundColor: theme.colors.gray[0],
    },
}));
