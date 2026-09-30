import {
    buildCartesianEchartsOption,
    CARTESIAN_HOVER_EMPHASIS,
    getAxisTypeFromField,
    type LegendValues,
} from '@lightdash/visualization';
import { useMemo } from 'react';
import { isCartesianVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useVisualizationTheme } from '../useVisualizationTheme';

export { CARTESIAN_HOVER_EMPHASIS, getAxisTypeFromField };

/**
 * The ECharts option for the cartesian chart in the visualization context.
 * The option itself is built by `@lightdash/visualization`.
 */
const useEchartsCartesianConfig = (
    validCartesianConfigLegend?: LegendValues,
    isInDashboard?: boolean,
    chartWidth: number | null = null,
) => {
    const {
        visualizationConfig,
        pivotDimensions,
        resultsData,
        itemsMap,
        getSeriesColor,
        minimal,
        parameters,
        isTouchDevice,
        colorPalette,
        resolvedTimezone,
    } = useVisualizationContext();

    const theme = useVisualizationTheme();

    const cartesianConfig = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
    const validCartesianConfig = cartesianConfig?.validConfig;
    const tooltipHtmlTemplate = cartesianConfig?.tooltip;
    const tooltipSort = cartesianConfig?.tooltipSort;

    return useMemo(
        () =>
            buildCartesianEchartsOption({
                validCartesianConfig,
                tooltipHtmlTemplate,
                tooltipSort,
                pivotDimensions,
                resultsData,
                itemsMap,
                getSeriesColor,
                minimal,
                parameters,
                isTouchDevice,
                colorPalette,
                resolvedTimezone,
                theme,
                legendSelected: validCartesianConfigLegend,
                isInDashboard,
                chartWidth,
            }),
        [
            validCartesianConfig,
            tooltipHtmlTemplate,
            tooltipSort,
            pivotDimensions,
            resultsData,
            itemsMap,
            getSeriesColor,
            minimal,
            parameters,
            isTouchDevice,
            colorPalette,
            resolvedTimezone,
            theme,
            validCartesianConfigLegend,
            isInDashboard,
            chartWidth,
        ],
    );
};

export default useEchartsCartesianConfig;
