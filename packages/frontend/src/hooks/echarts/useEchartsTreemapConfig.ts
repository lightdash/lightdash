import { buildTreemapEchartsOption } from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import { isTreemapVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useVisualizationTheme } from '../useVisualizationTheme';

/**
 * The ECharts option for the treemap in the visualization context.
 * The option itself is built by `@lightdash/visualization`.
 */
const useEchartsTreemapConfig = (isInDashboard: boolean) => {
    const {
        visualizationConfig,
        itemsMap,
        colorPalette,
        parameters,
        isTouchDevice,
        minimal,
        resolvedTimezone,
    } = useVisualizationContext();
    const theme = useVisualizationTheme();

    const treemapConfig = isTreemapVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;

    return useMemo(
        () =>
            buildTreemapEchartsOption({
                treemapConfig,
                itemsMap,
                colorPalette,
                parameters,
                tooltipAppendToBody: !isTouchDevice,
                animation: !(isInDashboard || minimal),
                resolvedTimezone,
                theme,
            }),
        [
            treemapConfig,
            itemsMap,
            colorPalette,
            parameters,
            isTouchDevice,
            minimal,
            resolvedTimezone,
            isInDashboard,
            theme,
        ],
    );
};

export default useEchartsTreemapConfig;
