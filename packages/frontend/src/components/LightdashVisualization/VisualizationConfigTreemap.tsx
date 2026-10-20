import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
} from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useTreemapChartConfig from '../../hooks/useTreemapChartConfig';
import {
    type VisualizationConfigTreemapProps,
    type VisualizationConfigTreemap,
} from './types';

const VisualizationConfigTreemap: FC<VisualizationConfigTreemapProps> = ({
    itemsMap,
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    tableCalculationsMetadata,
    children,
}) => {
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

export default VisualizationConfigTreemap;
