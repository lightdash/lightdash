import { createStyles } from '@mantine/core';

export const useCategoryStyles = createStyles((theme, color: string) => ({
    base: {
        border: `1px solid ${theme.fn.lighten(color, 0.45)}`,
        backgroundColor: theme.fn.lighten(color, 0.92),
        color: theme.fn.darken(color, 0.4),
        cursor: 'pointer',
        boxShadow: '0px -2px 0px 0px rgba(4, 4, 4, 0.04) inset',
        '&:hover': {
            backgroundColor: theme.fn.lighten(color, 0.8),
        },
    },
    removeIcon: {
        color: theme.fn.darken(color, 0.4),
    },
}));
