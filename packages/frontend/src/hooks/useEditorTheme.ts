import { useComputedColorScheme } from '@mantine/core';

/** Editor theme names that follow the app colour scheme. */
export const useEditorTheme = () => {
    const isDark = useComputedColorScheme('light') === 'dark';
    return {
        monaco: isDark ? 'lightdash-dark' : 'lightdash-light',
        ace: isDark ? 'tomorrow_night' : 'github',
    } as const;
};
