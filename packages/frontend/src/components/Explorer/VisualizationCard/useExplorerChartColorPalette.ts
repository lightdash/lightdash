import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { useComputedColorScheme } from '@mantine/core';
import { useMemo } from 'react';
import {
    selectSavedChart,
    selectUnsavedColorPaletteUuid,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';

/**
 * The colors the Explorer's chart renders with: a palette staged on the
 * chart, else the chart / space / dashboard / project cascade, corrected for
 * dark mode.
 */
export const useExplorerChartColorPalette = (
    projectUuid: string | undefined,
): string[] => {
    const colorScheme = useComputedColorScheme();
    const savedChart = useExplorerSelector(selectSavedChart);
    const stagedColorPaletteUuid = useExplorerSelector(
        selectUnsavedColorPaletteUuid,
    );
    // Clearing a chart-level palette skips the chart branch but keeps the
    // space cascade by seeding the walk from the chart's own space.
    const isClearingChartLevelPalette =
        stagedColorPaletteUuid === null && savedChart?.colorPaletteUuid != null;
    const { data: resolvedPalette } = useProjectColorPalette(projectUuid, {
        chartUuid: isClearingChartLevelPalette ? undefined : savedChart?.uuid,
        spaceUuid: isClearingChartLevelPalette
            ? savedChart?.spaceUuid
            : undefined,
        dashboardUuid: savedChart?.dashboardUuid ?? undefined,
    });

    const { data: palettes } = useColorPalettes({
        enabled: stagedColorPaletteUuid !== null,
    });
    const stagedPalette = useMemo(() => {
        if (stagedColorPaletteUuid === null) {
            return undefined;
        }
        return palettes?.find(
            (p) => p.colorPaletteUuid === stagedColorPaletteUuid,
        );
    }, [stagedColorPaletteUuid, palettes]);

    return useMemo(() => {
        if (stagedPalette) {
            if (colorScheme === 'dark' && stagedPalette.darkColors) {
                return stagedPalette.darkColors;
            }
            return stagedPalette.colors;
        }
        if (colorScheme === 'dark' && resolvedPalette?.darkColors) {
            return resolvedPalette.darkColors;
        }
        return resolvedPalette?.colors ?? ECHARTS_DEFAULT_COLORS;
    }, [colorScheme, resolvedPalette, stagedPalette]);
};
