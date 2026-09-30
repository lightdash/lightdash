import { buildGaugeEchartsOption } from '@lightdash/visualization';
import { useMantineTheme } from '@mantine/core';
import { useMemo } from 'react';
import { isGaugeVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useVisualizationTheme } from '../useVisualizationTheme';

type Args = {
    isInDashboard: boolean;
    tileFontSize: number;
    detailsFontSize: number;
    lineSize: number;
    radius: number;
};

/**
 * The ECharts option for the gauge in the visualization context.
 * The option itself is built by `@lightdash/visualization`.
 */
const useEchartsGaugeConfig = ({
    isInDashboard,
    tileFontSize,
    detailsFontSize,
    lineSize,
    radius,
}: Args) => {
    const {
        visualizationConfig,
        itemsMap,
        resultsData,
        parameters,
        minimal,
        resolvedTimezone,
    } = useVisualizationContext();
    const theme = useVisualizationTheme();
    // The section border in dark mode reads Mantine's `dark` ramp, which the
    // visualization theme does not carry.
    const mantineDarkColors = useMantineTheme().colors.dark;

    const validGaugeConfig = isGaugeVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.validConfig
        : undefined;

    const eChartsOption = useMemo(
        () =>
            buildGaugeEchartsOption({
                validGaugeConfig,
                itemsMap,
                resultsData,
                parameters,
                minimal,
                resolvedTimezone,
                isInDashboard,
                theme,
                mantineDarkColors,
                tileFontSize,
                detailsFontSize,
                lineSize,
                radius,
            }),
        [
            validGaugeConfig,
            itemsMap,
            resultsData,
            parameters,
            minimal,
            resolvedTimezone,
            isInDashboard,
            theme,
            mantineDarkColors,
            tileFontSize,
            detailsFontSize,
            lineSize,
            radius,
        ],
    );

    if (!eChartsOption) return;

    return { eChartsOption };
};

export default useEchartsGaugeConfig;
