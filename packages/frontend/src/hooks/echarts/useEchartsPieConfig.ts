import {
    buildPieEchartsOption,
    type PieSeriesDataPoint,
} from '@lightdash/visualization';
import { useMemo } from 'react';
import { isPieVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useVisualizationTheme } from '../useVisualizationTheme';

export { type PieSeriesDataPoint };

/**
 * The ECharts option for the pie chart in the visualization context.
 * The option itself is built by `@lightdash/visualization`.
 */
const useEchartsPieConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
    const {
        visualizationConfig,
        resultsData,
        itemsMap,
        getGroupColor,
        minimal,
        parameters,
        isTouchDevice,
        resolvedTimezone,
    } = useVisualizationContext();

    const theme = useVisualizationTheme();

    const pieChartConfig = isPieVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;

    return useMemo(
        () =>
            buildPieEchartsOption({
                pieChartConfig,
                resultsData,
                itemsMap,
                getGroupColor,
                minimal,
                parameters,
                isTouchDevice,
                resolvedTimezone,
                theme,
                legendSelected: selectedLegends,
                isInDashboard,
            }),
        [
            pieChartConfig,
            resultsData,
            itemsMap,
            getGroupColor,
            minimal,
            parameters,
            isTouchDevice,
            resolvedTimezone,
            theme,
            selectedLegends,
            isInDashboard,
        ],
    );
};

export default useEchartsPieConfig;
