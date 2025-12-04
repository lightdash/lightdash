import { createStyles } from '@mantine/core';
import { type TAG_COLOR_SWATCHES } from '../utils/getRandomTagColor';

export const useCategoryStyles = createStyles(
    (theme, color: typeof TAG_COLOR_SWATCHES[number] | string) => {
        const isDarkMode = theme.colorScheme === 'dark';
        // Some colors might be custom colors, not in the mantine color palette
        const isMantineColorKey = color in theme.colors;

        // Dark mode: richer, more saturated colors
        // Light mode: soft, pastel backgrounds
        const textColor = isMantineColorKey
            ? isDarkMode
                ? theme.colors[color][2]
                : theme.colors[color][9]
            : isDarkMode
            ? theme.fn.lighten(color, 0.6)
            : theme.fn.darken(color, 0.2);

        const backgroundColor = isMantineColorKey
            ? isDarkMode
                ? theme.fn.darken(theme.colors[color][8], 0.5)
                : theme.fn.lighten(theme.colors[color][0], 0.1)
            : isDarkMode
            ? theme.fn.darken(color, 0.7)
            : theme.fn.lighten(color, 0.92);

        const hoverBackgroundColor = isMantineColorKey
            ? isDarkMode
                ? theme.fn.darken(theme.colors[color][7], 0.3)
                : theme.fn.lighten(theme.colors[color][4], 0.7)
            : isDarkMode
            ? theme.fn.darken(color, 0.5)
            : theme.fn.lighten(color, 0.8);

        const borderColor = isMantineColorKey
            ? isDarkMode
                ? theme.colors[color][6]
                : theme.colors[color][2]
            : isDarkMode
            ? theme.fn.darken(color, 0.3)
            : theme.fn.lighten(color, 0.45);

        const removeIconColor = isMantineColorKey
            ? isDarkMode
                ? theme.fn.lighten(theme.colors[color][4], 0.2)
                : theme.fn.darken(theme.colors[color][6], 0.4)
            : isDarkMode
            ? theme.fn.lighten(color, 0.3)
            : theme.fn.darken(color, 0.4);

        const focusOutlineColor = isMantineColorKey
            ? theme.colors[color][5]
            : theme.fn.darken(color, 0.3);

        return {
            base: {
                border: `1px solid ${borderColor}`,
                backgroundColor,
                color: textColor,
                cursor: 'pointer',
                boxShadow: '0px -1px 0px 0px rgba(4, 4, 4, 0.04) inset',
                outline: 'none',
                '&:focus': {
                    outline: `2px solid ${focusOutlineColor}`,
                    outlineOffset: '2px',
                    backgroundColor: hoverBackgroundColor,
                    transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                },
            },
            removeIcon: {
                color: removeIconColor,
            },
            withHover: {
                '&:hover': {
                    backgroundColor: hoverBackgroundColor,
                    transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                },
            },
        };
    },
);
