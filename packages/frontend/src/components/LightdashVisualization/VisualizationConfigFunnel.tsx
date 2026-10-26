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

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationConfigFunnel);
