import { type useMantineTheme } from '@mantine/core';

export const getTagColorSwatches = (
    mantineColors: ReturnType<typeof useMantineTheme>['colors'],
) => {
    const colors = [
        mantineColors.gray[5],
        mantineColors.violet[4],
        mantineColors.red[4],
        mantineColors.orange[4],
        mantineColors.green[4],
        mantineColors.blue[4],
        mantineColors.indigo[4],
        mantineColors.pink[4],
        mantineColors.yellow[4],
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
