export const TAG_COLOR_SWATCHES = [
    'gray',
    'violet',
    'red',
    'orange',
    'green',
    'blue',
    'indigo',
    'pink',
    'yellow',
];

/**
 * Get a random color from the mantine color palette
 * @param mantineColors - The mantine color palette
 * @returns A random color from the mantine color palette
 */
export const getRandomColor = () => {
    return TAG_COLOR_SWATCHES[
        Math.floor(Math.random() * TAG_COLOR_SWATCHES.length)
    ];
};
