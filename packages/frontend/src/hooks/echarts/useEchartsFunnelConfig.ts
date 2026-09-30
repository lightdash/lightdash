import {
    buildFunnelEchartsOption,
    type FunnelSeriesDataPoint,
} from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import { isFunnelVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useVisualizationTheme } from '../useVisualizationTheme';

export { type FunnelSeriesDataPoint };

/**
 * The ECharts option for the funnel chart in the visualization context.
 * The option itself is built by `@lightdash/visualization`.
 */
const useEchartsFunnelConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
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

    const funnelConfig = isFunnelVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
    const validFunnelConfig = funnelConfig?.validConfig;
    const data = funnelConfig?.data;
    const maxValue = funnelConfig?.maxValue;
    const selectedField = funnelConfig?.selectedField;
    const colorDefaults = funnelConfig?.colorDefaults;

    return useMemo(
        () =>
            buildFunnelEchartsOption({
                validFunnelConfig,
                data: data ?? [],
                maxValue: maxValue ?? 0,
                selectedField,
                colorDefaults: colorDefaults ?? {},
                itemsMap,
                colorPalette,
                parameters,
                tooltipAppendToBody: !isTouchDevice,
                animation: !(isInDashboard || minimal),
                resolvedTimezone,
                theme,
                legendSelected: selectedLegends,
            }),
        [
            validFunnelConfig,
            data,
            maxValue,
            selectedField,
            colorDefaults,
            itemsMap,
            colorPalette,
            parameters,
            isTouchDevice,
            minimal,
            resolvedTimezone,
            theme,
            selectedLegends,
            isInDashboard,
        ],
    );
};

export default useEchartsFunnelConfig;
