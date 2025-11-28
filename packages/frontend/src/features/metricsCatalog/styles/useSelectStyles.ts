import { createStyles } from '@mantine/core';

export const useSelectStyles = createStyles((theme) => ({
    input: {
        fontWeight: 500,
        fontSize: 14,
        height: 32,
        borderColor: theme.colors.ldGray[2],
        borderRadius: theme.radius.md,
        boxShadow: theme.shadows.subtle,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        color: theme.colors.ldDark[7],
        '&:hover': {
            backgroundColor: theme.colors.ldGray[0],
            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
        },
        '&[value=""]': {
            border: `1px dashed ${theme.colors.ldGray[4]}`,
        },
    },
    item: {
        fontSize: 14,
        '&[data-selected="true"]': {
            color: theme.colors.ldGray[7],
            fontWeight: 500,
            backgroundColor: theme.colors.ldGray[0],
        },
        '&[data-selected="true"]:hover': {
            backgroundColor: theme.colors.ldGray[0],
        },
        '&:hover': {
            backgroundColor: theme.colors.ldGray[0],
            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
        },
    },
    dropdown: {
        minWidth: 300,
    },
    rightSection: {
        pointerEvents: 'none',
    },
}));
