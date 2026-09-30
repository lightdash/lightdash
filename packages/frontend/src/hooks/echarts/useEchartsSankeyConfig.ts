import { buildSankeyEchartsOption } from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import { isSankeyVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useVisualizationTheme } from '../useVisualizationTheme';

/**
 * The ECharts option for the sankey chart in the visualization context.
 * The option itself is built by `@lightdash/visualization`.
 */
const useEchartsSankeyConfig = (isInDashboard?: boolean) => {
    const {
        visualizationConfig,
        colorPalette,
        parameters,
        isTouchDevice,
        minimal,
        resolvedTimezone,
    } = useVisualizationContext();

    const theme = useVisualizationTheme();

    const sankeyConfig = isSankeyVisualizationConfig(visualizationConfig)
        ? visualizationConfig
        : undefined;
    const validSankeyConfig = sankeyConfig?.chartConfig.validConfig;
    const data = sankeyConfig?.chartConfig.data;
    const numericFields = sankeyConfig?.numericFields;

    return useMemo(
        () =>
            buildSankeyEchartsOption({
                validSankeyConfig,
                data,
                numericFields,
                resultsData: undefined,
                itemsMap: undefined,
                colorPalette,
                parameters,
                tooltipAppendToBody: !isTouchDevice,
                animation: !(isInDashboard || minimal),
                resolvedTimezone,
                theme,
            }),
        [
            validSankeyConfig,
            data,
            numericFields,
            colorPalette,
            parameters,
            isTouchDevice,
            minimal,
            resolvedTimezone,
            theme,
            isInDashboard,
        ],
    );
};

export default useEchartsSankeyConfig;
