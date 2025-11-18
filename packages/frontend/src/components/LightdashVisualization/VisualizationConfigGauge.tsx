import {
    ChartType,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type TableCalculation,
} from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import useGaugeChartConfig from '../../hooks/useGaugeChartConfig';
import {
    type VisualizationConfigGauge,
    type VisualizationConfigGaugeProps,
} from './types';

const VisualizationGaugeConfig: React.FC<VisualizationConfigGaugeProps> = ({
    itemsMap,
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const numericMetrics = useMemo(() => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);

        const numericTableCalculations = Object.keys(tableCalculations).reduce<
            Record<string, TableCalculation>
        >((acc, key) => {
            const tableCalculation = tableCalculations[key];
            if (isNumericItem(tableCalculation)) {
                acc[key] = tableCalculation;
            }
            return acc;
        }, {});
        return { ...metrics, ...numericTableCalculations };
    }, [itemsMap]);

    const gaugeConfig = useGaugeChartConfig(
        initialChartConfig as any,
        itemsMap,
    );

    useEffect(() => {
        if (!onChartConfigChange || !gaugeConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.GAUGE,
            config: gaugeConfig.validConfig,
        });
    }, [gaugeConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigGauge = useMemo(
        () => ({
            chartType: gaugeConfig.chartType,
            chartConfig: gaugeConfig,
            numericMetrics,
        }),
        [gaugeConfig, numericMetrics],
    );

    return children({ visualizationConfig });
};

export default VisualizationGaugeConfig;
