import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
} from '@lightdash/common';
import { useEffect, useMemo, type FC, memo } from 'react';
import useTreemapChartConfig from '../../hooks/useTreemapChartConfig';
import {
    type VisualizationConfigTreemapProps,
    type VisualizationConfigTreemap,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationConfigTreemap: FC<VisualizationConfigTreemapProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const { itemsMap, resultsData, tableCalculationsMetadata } =
        useVisualizationInputs();
    const { dimensions, numericMetrics } = useMemo(() => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);
        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericMetrics: { ...metrics, ...tableCalculations },
        };
    }, [itemsMap]);

    const treemapConfig = useTreemapChartConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
        dimensions,
        numericMetrics,
        tableCalculationsMetadata,
    );

    useEffect(() => {
        if (!onChartConfigChange || !treemapConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.TREEMAP,
            config: treemapConfig.validConfig,
        });
    }, [treemapConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigTreemap = useMemo(
        () => ({
            chartType: ChartType.TREEMAP,
            chartConfig: treemapConfig,
            dimensions,
            numericMetrics,
        }),
        [treemapConfig, dimensions, numericMetrics],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationConfigTreemap);
