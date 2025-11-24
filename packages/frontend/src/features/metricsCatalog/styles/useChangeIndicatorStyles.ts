import { createStyles } from '@mantine/core';

export const useChangeIndicatorStyles = createStyles((theme) => {
    return {
        positive: {
            border: `1px solid ${theme.colors.teal[1]}`,
            background: theme.colors.teal[0],
            color: theme.colors.teal[9],
        },
        negative: {
            border: `1px solid ${theme.colors.red[1]}`,
            background: theme.colors.red[0],
            color: theme.colors.red[9],
        },
        neutral: {
            border: `1px solid ${theme.colors.ldGray[2]}`,
            background: '#F8F9FA',
            color: theme.colors.ldGray[7],
        },
    };
});
