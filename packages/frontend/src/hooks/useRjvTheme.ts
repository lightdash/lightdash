import { useMantineColorScheme } from '@mantine-8/core';

export const useRjvTheme = () => {
    const { colorScheme } = useMantineColorScheme();
    return colorScheme === 'light' ? 'rjv-default' : 'chalk';
};
