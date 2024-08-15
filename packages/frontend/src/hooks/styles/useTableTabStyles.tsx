import { createStyles } from '@mantine/emotion';

export const useTableTabStyles = createStyles((theme) => ({
    root: {
        flexGrow: 1,
    },
    tab: {
        borderRadius: 0,
        height: theme.spacing['4xl'],
        padding: `0 ${theme.spacing.lg}`,
    },
    tabsList: {
        borderBottom: 'none',
    },
}));
