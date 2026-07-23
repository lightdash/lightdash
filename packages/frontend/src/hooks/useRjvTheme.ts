import { useComputedColorScheme } from '@mantine-8/core';

export const useRjvTheme = () => {
    const colorScheme = useComputedColorScheme('light');
    return colorScheme === 'light' ? 'rjv-default' : 'chalk';
};
