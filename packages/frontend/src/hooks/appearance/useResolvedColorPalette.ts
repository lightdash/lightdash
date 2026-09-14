import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { useMemo } from 'react';
import { useColorPalettes } from './useOrganizationAppearance';
import { useProjectColorPalette } from './useProjectColorPalette';

/**
 * The explicitly chosen palette when one is given, otherwise the project's
 * (dark-mode corrected), falling back to the ECharts defaults.
 */
export const useResolvedColorPalette = (
    projectUuid: string | undefined,
    colorPaletteUuid: string | null = null,
): string[] => {
    const colorScheme = useComputedColorScheme();
    const { data: palettes = [] } = useColorPalettes();
    const { data: projectPalette } = useProjectColorPalette(projectUuid);

    return useMemo(() => {
        const source =
            palettes.find((p) => p.colorPaletteUuid === colorPaletteUuid) ??
            projectPalette;
        if (!source) return ECHARTS_DEFAULT_COLORS;
        if (colorScheme === 'dark' && source.darkColors) {
            return source.darkColors;
        }
        return source.colors;
    }, [palettes, colorPaletteUuid, projectPalette, colorScheme]);
};
