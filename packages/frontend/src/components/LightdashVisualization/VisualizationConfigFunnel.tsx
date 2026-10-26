import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type TableCalculation,
} from '@lightdash/common';
import { useEffect, useMemo, type FC, memo } from 'react';
import useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import {
    type VisualizationConfigFunnelProps,
    type VisualizationConfigFunnelType,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationConfigFunnel: FC<VisualizationConfigFunnelProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const { resultsData, itemsMap, colorPalette, tableCalculationsMetadata } =
        useVisualizationInputs();
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

    const visualizationConfig: VisualizationConfigFunnelType = useMemo(
        () => ({
            chartType: ChartType.FUNNEL,
            chartConfig: FunnelChartConfig,
            dimensions,
            numericFields,
        }),
        [FunnelChartConfig, dimensions, numericFields],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationConfigFunnel);
