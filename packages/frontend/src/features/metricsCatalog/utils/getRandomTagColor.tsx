import { type useMantineTheme } from '@mantine/core';

/**
 * Get a random color from the mantine color palette
 * @param mantineColors - The mantine color palette
 * @returns A random color from the mantine color palette
 */
export const getRandomColor = (
    mantineColors: ReturnType<typeof useMantineTheme>['colors'],
) => {
    const colors = [
        mantineColors.blue[5],
        mantineColors.blue[6],
        mantineColors.blue[7],
        mantineColors.cyan[5],
        mantineColors.cyan[6],
        mantineColors.cyan[7],
        mantineColors.teal[5],
        mantineColors.teal[6],
        mantineColors.teal[7],
        mantineColors.green[5],
        mantineColors.green[6],
        mantineColors.green[7],
        mantineColors.orange[5],
        mantineColors.orange[6],
        mantineColors.orange[7],
        mantineColors.red[5],
        mantineColors.red[6],
        mantineColors.red[7],
        mantineColors.pink[5],
        mantineColors.pink[6],
        mantineColors.pink[7],
        mantineColors.grape[5],
        mantineColors.grape[6],
        mantineColors.grape[7],
        mantineColors.violet[5],
        mantineColors.violet[6],
        mantineColors.violet[7],
        mantineColors.gray[6],
        mantineColors.gray[7],
        mantineColors.gray[8],
    ];
    return colors[Math.floor(Math.random() * colors.length)];
};
