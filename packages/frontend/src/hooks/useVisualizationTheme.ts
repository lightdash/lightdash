import { type VisualizationTheme } from '@lightdash/visualization/editor';
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
            neutral: theme.colors.ldGray,
            contrast: theme.colors.ldDark,
            accent: theme.colors.blue,
            chrome: theme.colors.dark,
            chartFont: theme.other.chartFont,
            tooltipPadding: Number(px(theme.spacing.xs)),
            tooltipShadow: theme.shadows.subtle,
        }),
        [theme, colorScheme],
    );
};
