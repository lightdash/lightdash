import { useMantineColorScheme } from '@mantine/core';

export const useRjvTheme = () => {
    const { colorScheme } = useMantineColorScheme();
    return colorScheme === 'light' ? 'rjv-default' : 'chalk';
};
