import { type VisualizationTheme } from '@lightdash/visualization';
import { px, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { useMemo } from 'react';

/**
 * The chart theme the visualization package renders with, read from the
 * Mantine theme so charts follow the app's color scheme.
 */
export const useVisualizationTheme = (): VisualizationTheme => {
    const theme = useMantineTheme();
    const colorScheme = useComputedColorScheme('light');

    return useMemo(
        () => ({
            colorScheme,
            background: theme.colors.background[0],
            foreground: theme.colors.foreground[0],
            gray: theme.colors.ldGray,
            dark: theme.colors.ldDark,
            blue: theme.colors.blue,
            chromeDark: theme.colors.dark,
            chartFont: theme.other.chartFont,
            spacingXs: Number(px(theme.spacing.xs)),
            shadowSubtle: theme.shadows.subtle,
        }),
        [theme, colorScheme],
    );
};
