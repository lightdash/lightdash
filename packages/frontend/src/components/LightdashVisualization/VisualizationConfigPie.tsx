import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import { selectPieFieldPools } from '../../features/visualization/store';
import usePieChartConfig from '../../hooks/usePieChartConfig';
import {
    type VisualizationConfigPie,
    type VisualizationConfigPieProps,
} from './types';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationPieConfig: FC<VisualizationConfigPieProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericMetrics } =
        useVisualizationInputSelector(selectPieFieldPools);
    const pieChartConfig = usePieChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.PIE,
            config: pieChartConfig.validConfig,
        });
    }, [pieChartConfig.validConfig, onChartConfigChange]);

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

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationPieConfig);
