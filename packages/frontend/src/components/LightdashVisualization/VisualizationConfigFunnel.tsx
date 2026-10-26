import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import { selectFunnelFieldPools } from '../../features/visualization/store';
import useFunnelChartConfig from '../../hooks/useFunnelChartConfig';
import {
    type VisualizationConfigFunnelProps,
    type VisualizationConfigFunnelType,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationConfigFunnel: FC<VisualizationConfigFunnelProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericFields } = useVisualizationInputSelector(
        selectFunnelFieldPools,
    );
    const funnelChartConfig = useFunnelChartConfig();

    useEmitChartConfig(
        ChartType.FUNNEL,
        funnelChartConfig.validConfig,
        onChartConfigChange,
    );

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

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationConfigFunnel);
