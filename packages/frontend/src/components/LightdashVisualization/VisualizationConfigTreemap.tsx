import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
} from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useTreemapChartConfig from '../../hooks/useTreemapChartConfig';
import { type VisualizationConfigTreemapProps } from './types';

const VisualizationConfigTreemap: FC<VisualizationConfigTreemapProps> = ({
    itemsMap,
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    tableCalculationsMetadata,
    children,
    parameters,
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
        parameters,
    );

    useEffect(() => {
        if (!onChartConfigChange || !treemapConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.TREEMAP,
            config: treemapConfig.validConfig,
        });
    }, [treemapConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.TREEMAP,
            chartConfig: treemapConfig,
            dimensions,
            numericMetrics,
        },
    });
};

export default VisualizationConfigTreemap;
