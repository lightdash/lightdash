import { type useMantineTheme } from '@mantine/core';

export const getTagColorSwatches = (
    mantineColors: ReturnType<typeof useMantineTheme>['colors'],
) => {
    const colors = [
        mantineColors.blue[7],
        mantineColors.indigo[8],
        mantineColors.teal[4],
        mantineColors.orange[6],
        mantineColors.red[6],
        mantineColors.yellow[4],
        mantineColors.grape[7],
        mantineColors.pink[7],
        mantineColors.violet[6],
        mantineColors.gray[6],
    ];
    return colors;
};

/**
 * Get a random color from the mantine color palette
 * @param mantineColors - The mantine color palette
 * @returns A random color from the mantine color palette
 */
export const getRandomColor = (
    mantineColors: ReturnType<typeof useMantineTheme>['colors'],
) => {
    return getTagColorSwatches(mantineColors)[
        Math.floor(Math.random() * getTagColorSwatches(mantineColors).length)
    ];
};
