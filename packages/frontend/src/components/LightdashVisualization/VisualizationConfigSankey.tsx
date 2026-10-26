import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import { selectSankeyFieldPools } from '../../features/visualization/store';
import useSankeyChartConfig from '../../hooks/useSankeyChartConfig';
import {
    type VisualizationConfigSankeyProps,
    type VisualizationConfigSankeyType,
} from './types';
import { useVisualizationInputSelector } from './useVisualizationContext';

const VisualizationConfigSankey: FC<VisualizationConfigSankeyProps> = ({
    onChartConfigChange,
    children,
}) => {
    const { dimensions, numericFields } = useVisualizationInputSelector(
        selectSankeyFieldPools,
    );
    const sankeyChartConfig = useSankeyChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.SANKEY,
            config: sankeyChartConfig.validConfig,
        });
    }, [sankeyChartConfig.validConfig, onChartConfigChange]);

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

// Memoised so a resize skips it; an echoed config still re-renders it (new chartConfig in its props)
export default memo(VisualizationConfigSankey);
