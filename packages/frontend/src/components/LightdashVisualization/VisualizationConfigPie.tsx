import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import { selectPieFieldPools } from '../../features/visualization/store';
import usePieChartConfig from '../../hooks/usePieChartConfig';
import {
    type VisualizationConfigPie,
    type VisualizationConfigPieProps,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationPieConfig: FC<VisualizationConfigPieProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericMetrics } =
        useVisualizationInputSelector(selectPieFieldPools);
    const pieChartConfig = usePieChartConfig();

    useEmitChartConfig(
        ChartType.PIE,
        pieChartConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationConfigPie = useMemo(
        () => ({
            chartType: ChartType.PIE,
            chartConfig: pieChartConfig,
            dimensions,
            numericMetrics,
        }),
        [pieChartConfig, dimensions, numericMetrics],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationPieConfig);
