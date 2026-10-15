import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { useMemo } from 'react';
import { useProjectColorPalette } from '../../../../../hooks/appearance/useProjectColorPalette';

/** The project palette for the current color scheme. */
export const useComposerChartColors = (projectUuid: string) => {
    const isDark = useComputedColorScheme('light') === 'dark';
    const { data: palette } = useProjectColorPalette(projectUuid);
    return useMemo(
        () =>
            (isDark ? palette?.darkColors : undefined) ??
            palette?.colors ??
            ECHARTS_DEFAULT_COLORS,
        [isDark, palette],
    );
};
