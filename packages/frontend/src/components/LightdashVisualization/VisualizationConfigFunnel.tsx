import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type TableCalculation,
} from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import { type VisualizationConfigFunnelProps } from './types';

const VisualizationConfigFunnel: FC<VisualizationConfigFunnelProps> = ({
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    itemsMap,
    colorPalette,
    children,
    tableCalculationsMetadata,
}) => {
    const { dimensions, numericFields } = useMemo(() => {
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

        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericFields: { ...metrics, ...numericTableCalculations },
        };
    }, [itemsMap]);

    const FunnelChartConfig = useFunnelChartConfig(
        resultsData,
        initialChartConfig,
        itemsMap,
        numericFields,
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
            numericFields,
        },
    });
};

export default VisualizationConfigFunnel;
