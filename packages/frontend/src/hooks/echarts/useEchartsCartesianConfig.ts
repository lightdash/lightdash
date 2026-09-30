import {
    buildCartesianChartData,
    buildCartesianEchartsOptionFromData,
    buildCartesianLegendState,
    CARTESIAN_HOVER_EMPHASIS,
    getAxisTypeFromField,
    type LegendValues,
} from '@lightdash/visualization/editor';
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

    // Three memo stages, like the hook's memo chain before the option moved
    // into @lightdash/visualization: a legend toggle re-runs the last two and
    // a resize (SimpleChart updates chartWidth on every frame) only the last.
    const chartData = useMemo(
        () =>
            buildCartesianChartData({
                validCartesianConfig,
                tooltipHtmlTemplate,
                tooltipSort,
                pivotDimensions,
                resultsData,
                itemsMap,
                getSeriesColor,
                animation: !(isInDashboard || minimal),
                parameters,
                tooltipAppendToBody: !isTouchDevice,
                colorPalette,
                resolvedTimezone,
                theme,
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
            isInDashboard,
        ],
    );

    const legendState = useMemo(
        () => buildCartesianLegendState(chartData, validCartesianConfigLegend),
        [chartData, validCartesianConfigLegend],
    );

    // The width only sizes outside-legend labels; ignore it otherwise so a
    // resize doesn't rebuild the option at all.
    const legendPlacement =
        validCartesianConfig?.eChartsConfig.legend?.placement;
    const legendChartWidth =
        legendPlacement === 'outsideLeft' || legendPlacement === 'outsideRight'
            ? chartWidth
            : null;

    return useMemo(
        () =>
            buildCartesianEchartsOptionFromData(legendState, {
                chartWidth: legendChartWidth,
            }),
        [legendState, legendChartWidth],
    );
};

export default useEchartsCartesianConfig;
