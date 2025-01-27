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
        root: {
            flexGrow: 1,
        },
        input: {
            ...base.baseInput,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.radius.md,
            minWidth: 200,
            // truncate text
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            maxWidth: '100%',

            '&[value=""]': {
                border: `1px dashed ${theme.colors.gray[4]}`,
            },
            '&[data-selected="true"]': {
                borderBottomRightRadius: 0,
                borderBottomLeftRadius: theme.radius.md,
                borderTopRightRadius: 0,
            },
            '&[data-no-values="true"]': {
                borderBottomLeftRadius: theme.radius.md,
            },
            '&[data-no-values="false"]': {
                borderBottomLeftRadius: 0,
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
        root: {
            '&:has(input[data-full-width="true"])': {
                flexGrow: 1,
            },
        },
        input: {
            ...base.baseInput,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.radius.md,
            width: 100,
            minWidth: 100,
            maxWidth: 100,
            marginLeft: -1,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            borderTop: 0,
            paddingRight: 8,
            paddingLeft: 8,
            '&[data-full-width="true"]': {
                width: '100%',
                maxWidth: '100%',
            },
        },
        item: base.baseItem,
        dropdown: {
            minWidth: 100,
        },
        rightSection: {
            pointerEvents: 'none',
        },
    };
});

export const useFilterAutoCompleteStyles = createStyles(
    (theme: MantineTheme) => {
        const base = baseStyles(theme);
        return {
            root: {
                flexGrow: 1,
            },
            input: {
                ...base.baseInput,
                borderRadius: theme.radius.md,
                padding: `${theme.spacing.xxs} ${theme.spacing.sm}`,
                borderTop: 0,
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                height: 'auto',
            },
            item: {
                ...base.baseItem,
                // makes add new item button sticky to bottom
                '&:last-child:not([value])': {
                    position: 'sticky',
                    bottom: 4,
                    // casts shadow on the bottom of the list to avoid transparency
                    boxShadow: '0 4px 0 0 white',
                },
                '&:last-child:not([value]):not(:hover)': {
                    background: 'white',
                },
            },
            searchInput: {
                fontWeight: 500,
            },
            dropdown: {
                minWidth: 100,
            },
            rightSection: {
                pointerEvents: 'none',
            },
        };
    },
);
