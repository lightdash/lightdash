import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import { selectFunnelFieldPools } from '../../features/visualization/store';
import useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import {
    type VisualizationConfigFunnelProps,
    type VisualizationConfigFunnelType,
} from './types';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationConfigFunnel: FC<VisualizationConfigFunnelProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericFields } = useVisualizationInputSelector(
        selectFunnelFieldPools,
    );
    const funnelChartConfig = useFunnelChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.FUNNEL,
            config: funnelChartConfig.validConfig,
        });
    }, [funnelChartConfig.validConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigFunnelType = useMemo(
        () => ({
            chartType: ChartType.FUNNEL,
            chartConfig: funnelChartConfig,
            dimensions,
            numericFields,
        }),
        [funnelChartConfig, dimensions, numericFields],
    );

    return children({ visualizationConfig });
};

// Skips provider re-renders that keep its props (a resize); an echoed config changes them
export default memo(VisualizationConfigFunnel);
