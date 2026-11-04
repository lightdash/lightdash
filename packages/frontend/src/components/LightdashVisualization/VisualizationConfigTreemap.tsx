import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import { selectDimensionsAndNumericMetrics } from '../../features/visualization/store';
import useTreemapChartConfig from '../../hooks/useTreemapChartConfig';
import {
    type VisualizationConfigTreemap,
    type VisualizationConfigTreemapProps,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationConfigTreemap: FC<VisualizationConfigTreemapProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericMetrics } = useVisualizationInputSelector(
        selectDimensionsAndNumericMetrics,
    );
    const treemapConfig = useTreemapChartConfig();

    useEmitChartConfig(
        ChartType.TREEMAP,
        treemapConfig.validConfig,
        onChartConfigChange,
    );

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

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationConfigTreemap);
