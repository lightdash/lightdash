import { createStyles } from '@mantine/core';
import { type TAG_COLOR_SWATCHES } from '../utils/getRandomTagColor';

export const useCategoryStyles = createStyles(
    (theme, color: typeof TAG_COLOR_SWATCHES[number] | string) => {
        // Some colors might be custom colors, not in the mantine color palette
        const isMantineColorKey = color in theme.colors;
        const textColor = isMantineColorKey
            ? theme.colors[color][9]
            : theme.fn.darken(color, 0.2);
        const backgroundColor = isMantineColorKey
            ? theme.fn.lighten(theme.colors[color][0], 0.1)
            : theme.fn.lighten(color, 0.92);
        const hoverBackgroundColor = isMantineColorKey
            ? theme.fn.lighten(theme.colors[color][4], 0.7)
            : theme.fn.lighten(color, 0.8);
        const borderColor = isMantineColorKey
            ? theme.colors[color][2]
            : theme.fn.lighten(color, 0.45);
        const removeIconColor = isMantineColorKey
            ? theme.fn.darken(theme.colors[color][6], 0.4)
            : theme.fn.darken(color, 0.4);

        return {
            base: {
                border: `1px solid ${borderColor}`,
                backgroundColor,
                color: textColor,
                cursor: 'pointer',
                boxShadow: '0px -1px 0px 0px rgba(4, 4, 4, 0.04) inset',
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
