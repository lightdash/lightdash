import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import { selectSankeyFieldPools } from '../../features/visualization/store';
import useSankeyChartConfig from '../../hooks/useSankeyChartConfig';
import {
    type VisualizationConfigSankeyProps,
    type VisualizationConfigSankeyType,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationConfigSankey: FC<VisualizationConfigSankeyProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericFields } = useVisualizationInputSelector(
        selectSankeyFieldPools,
    );
    const sankeyChartConfig = useSankeyChartConfig();

    useEmitChartConfig(
        ChartType.SANKEY,
        sankeyChartConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationConfigSankeyType = useMemo(
        () => ({
            chartType: ChartType.SANKEY,
            chartConfig: sankeyChartConfig,
            dimensions,
            numericFields,
        }),
        [sankeyChartConfig, dimensions, numericFields],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationConfigSankey);
