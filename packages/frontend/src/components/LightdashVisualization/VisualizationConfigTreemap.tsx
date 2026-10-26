import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import { selectTreemapFieldPools } from '../../features/visualization/store';
import useTreemapChartConfig from '../../hooks/useTreemapChartConfig';
import {
    type VisualizationConfigTreemap,
    type VisualizationConfigTreemapProps,
} from './types';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationConfigTreemap: FC<VisualizationConfigTreemapProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericMetrics } = useVisualizationInputSelector(
        selectTreemapFieldPools,
    );
    const treemapConfig = useTreemapChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.TREEMAP,
            config: treemapConfig.validConfig,
        });
    }, [treemapConfig.validConfig, onChartConfigChange]);

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

// Memoised so a resize skips it; an echoed config still re-renders it (new chartConfig in its props)
export default memo(VisualizationConfigTreemap);
