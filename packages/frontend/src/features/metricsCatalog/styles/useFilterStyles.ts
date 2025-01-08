import { createStyles, type MantineTheme } from '@mantine/core';

// Base styles that are shared across components
const baseStyles = (theme: MantineTheme) => ({
    baseInput: {
        fontWeight: 500,
        fontSize: 14,
        height: 32,
        borderColor: theme.colors.gray[2],
        color: theme.colors.dark[7],
        '&:hover': {
            backgroundColor: theme.colors.gray[0],
            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
        },
        '&:focus': {
            borderColor: theme.colors.gray[2],
        },
        '&:focus-within': {
            borderColor: theme.colors.gray[2],
        },
    },
    baseItem: {
        fontSize: 14,
        '&[data-selected="true"]': {
            color: theme.colors.gray[7],
            fontWeight: 500,
            backgroundColor: theme.colors.gray[0],
        },
        '&[data-selected="true"]:hover': {
            backgroundColor: theme.colors.gray[0],
        },
        '&:hover': {
            backgroundColor: theme.colors.gray[0],
            transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
        },
    },
});

export const useFilterSelectStyles = createStyles((theme) => {
    const base = baseStyles(theme);
    return {
        input: {
            ...base.baseInput,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.radius.md,
            '&[value=""]': {
                border: `1px dashed ${theme.colors.gray[4]}`,
            },
            '&[data-selected="true"]': {
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
            },
        },
        item: base.baseItem,
        dropdown: {
            minWidth: 300,
        },
        rightSection: {
            pointerEvents: 'none',
        },
    };
});

export const useOperatorSelectStyles = createStyles((theme: MantineTheme) => {
    const base = baseStyles(theme);
    return {
        input: {
            ...base.baseInput,
            padding: `${theme.spacing.xxs} ${theme.spacing.sm}`,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            borderTop: 0,
            paddingRight: 8,
            paddingLeft: 8,
            width: 90,
            maxWidth: 90,
            '&[value=""]': {
                border: `1px dashed ${theme.colors.gray[4]}`,
            },
        },
        inputReadOnly: {
            backgroundColor: theme.colors.gray[0],
            borderRight: 0,
            pointerEvents: 'none',
        },
        item: base.baseItem,
        dropdown: {
            minWidth: 60,
        },
        rightSection: {
            pointerEvents: 'none',
            width: 20,
        },
    };
});

export const useFilterTagInputStyles = createStyles((theme: MantineTheme) => {
    const base = baseStyles(theme);
    return {
        wrapper: {
            width: 200,
        },
        input: {
            ...base.baseInput,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            '&[data-disabled="true"]': {
                border: `1px dashed ${theme.colors.gray[4]}`,
                borderLeft: 0,
            },
        },
        tagInput: {
            fontWeight: 500,
            fontSize: 14,
            '&[readonly]': {
                backgroundColor: theme.colors.gray[0],
                borderRight: 0,
                pointerEvents: 'none',
            },
        },
        tagInputEmpty: {
            fontWeight: 500,
        },
        value: {
            fontWeight: 500,
            borderRadius: theme.radius.sm,
            color: theme.colors.dark[7],
            border: `1px solid ${theme.colors.gray[2]}`,
        },
        values: {
            maxHeight: 32,
        },
        tagInputContainer: {
            ...base.baseInput,
            borderRadius: theme.radius.md,
            borderTopRightRadius: 0,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderLeft: 0,
            borderTop: 0,
            overflow: 'scroll',
            '&:has(input[readonly])': {
                backgroundColor: theme.colors.gray[0],
            },
        },
        rightSection: {
            pointerEvents: 'none',
        },
    };
});
