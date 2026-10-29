import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import { selectNumericMetricsAndTableCalculations } from '../../features/visualization/store';
import useGaugeChartConfig from '../../hooks/useGaugeChartConfig';
import {
    type VisualizationConfigGauge,
    type VisualizationConfigGaugeProps,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationGaugeConfig: FC<VisualizationConfigGaugeProps> = ({
    onChartConfigChange,
    children,
}) => {
    const numericMetrics = useVisualizationInputSelector(
        selectNumericMetricsAndTableCalculations,
    );
    const gaugeConfig = useGaugeChartConfig();

    useEmitChartConfig(
        ChartType.GAUGE,
        gaugeConfig.validConfig,
        onChartConfigChange,
    );

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

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationGaugeConfig);
