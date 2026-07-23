import {
    darken,
    lighten,
    useComputedColorScheme,
    useMantineTheme,
} from '@mantine-8/core';
import { type TAG_COLOR_SWATCHES } from '../utils/getRandomTagColor';

export type CategoryColors = {
    textColor: string;
    backgroundColor: string;
    hoverBackgroundColor: string;
    borderColor: string;
    removeIconColor: string;
    focusOutlineColor: string;
};

export const useCategoryColors = (
    color: (typeof TAG_COLOR_SWATCHES)[number],
): CategoryColors => {
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('light');
    const isDarkMode = colorScheme === 'dark';
    // Some colors might be custom colors, not in the mantine color palette
    const isMantineColorKey = color in theme.colors;

    // Dark mode: richer, more saturated colors
    // Light mode: soft, pastel backgrounds
    const textColor = isMantineColorKey
        ? isDarkMode
            ? theme.colors[color][2]
            : theme.colors[color][9]
        : isDarkMode
          ? lighten(color, 0.6)
          : darken(color, 0.2);

    const backgroundColor = isMantineColorKey
        ? isDarkMode
            ? darken(theme.colors[color][8], 0.5)
            : lighten(theme.colors[color][0], 0.1)
        : isDarkMode
          ? darken(color, 0.7)
          : lighten(color, 0.92);

    const hoverBackgroundColor = isMantineColorKey
        ? isDarkMode
            ? darken(theme.colors[color][7], 0.3)
            : lighten(theme.colors[color][4], 0.7)
        : isDarkMode
          ? darken(color, 0.5)
          : lighten(color, 0.8);

    const borderColor = isMantineColorKey
        ? isDarkMode
            ? theme.colors[color][6]
            : theme.colors[color][2]
        : isDarkMode
          ? darken(color, 0.3)
          : lighten(color, 0.45);

    const removeIconColor = isMantineColorKey
        ? isDarkMode
            ? lighten(theme.colors[color][4], 0.2)
            : darken(theme.colors[color][6], 0.4)
        : isDarkMode
          ? lighten(color, 0.3)
          : darken(color, 0.4);

    const focusOutlineColor = isMantineColorKey
        ? theme.colors[color][5]
        : darken(color, 0.3);

    return {
        textColor,
        backgroundColor,
        hoverBackgroundColor,
        borderColor,
        removeIconColor,
        focusOutlineColor,
    };
};
