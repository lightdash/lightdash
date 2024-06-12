import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import {
    type VisualizationConfig,
    type VisualizationConfigCommon,
} from './VisualizationProvider';

export type VisualizationConfigFunnelType = {
    chartType: ChartType.FUNNEL;
    chartConfig: ReturnType<typeof useFunnelChartConfig>;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericMetrics: Record<string, Metric | TableCalculation>;
};

export const isFunnelVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigFunnelType => {
    return visualizationConfig?.chartType === ChartType.FUNNEL;
};

type VisualizationConfigFunnelProps =
    VisualizationConfigCommon<VisualizationConfigFunnelType> & {
        itemsMap: ItemsMap | undefined;
        colorPalette: string[];
        tableCalculationsMetadata?: TableCalculationMetadata[];
    };

const VisualizationConfigFunnel: FC<VisualizationConfigFunnelProps> = ({
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    itemsMap,
    colorPalette,
    children,
    tableCalculationsMetadata,
}) => {
    const { dimensions, numericMetrics } = useMemo(() => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);
        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericMetrics: { ...metrics, ...tableCalculations },
        };
    }, [itemsMap]);

    const FunnelChartConfig = useFunnelChartConfig(
        resultsData,
        initialChartConfig,
        itemsMap,
        dimensions,
        numericMetrics,
        colorPalette,
        tableCalculationsMetadata,
    );

    useEffect(() => {
        if (!onChartConfigChange || !FunnelChartConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.FUNNEL,
            config: FunnelChartConfig.validConfig,
        });
    }, [FunnelChartConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.FUNNEL,
            chartConfig: FunnelChartConfig,
            dimensions,
            numericMetrics,
        },
    });
};

export default VisualizationConfigFunnel;
