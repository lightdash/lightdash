import { createStyles } from '@mantine/core';

export const useStyles = createStyles((theme) => ({
    table: {
        '& td, & th': {
            whiteSpace: 'nowrap',
        },
    },
    header: {
        fontWeight: 'bold',
        backgroundColor: theme.colors.gray[0],
    },
}));
