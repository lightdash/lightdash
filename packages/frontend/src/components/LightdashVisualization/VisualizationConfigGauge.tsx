import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import { selectNumericMetricsAndTableCalculations } from '../../features/visualization/store';
import useGaugeChartConfig from '../../hooks/useGaugeChartConfig';
import {
    type VisualizationConfigGauge,
    type VisualizationConfigGaugeProps,
} from './types';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationGaugeConfig: FC<VisualizationConfigGaugeProps> = ({
    onChartConfigChange,
    children,
}) => {
    const numericMetrics = useVisualizationInputSelector(
        selectNumericMetricsAndTableCalculations,
    );
    const gaugeConfig = useGaugeChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.GAUGE,
            config: gaugeConfig.validConfig,
        });
    }, [gaugeConfig.validConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigGauge = useMemo(
        () => ({
            chartType: ChartType.GAUGE,
            chartConfig: gaugeConfig,
            numericMetrics,
        }),
        [gaugeConfig, numericMetrics],
    );

    return children({ visualizationConfig });
};

// Skips provider re-renders that keep its props (a resize); an echoed config changes them
export default memo(VisualizationGaugeConfig);
