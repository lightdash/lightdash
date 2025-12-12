import { ChartType } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import useSankeyChartConfig from '../../hooks/useSankeyChartConfig';
import {
    type VisualizationConfigSankey,
    type VisualizationConfigSankeyProps,
} from './types';

const VisualizationSankeyConfig: React.FC<VisualizationConfigSankeyProps> = ({
    itemsMap,
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const sankeyConfig = useSankeyChartConfig(
        initialChartConfig as any,
        itemsMap,
    );

    useEffect(() => {
        if (!onChartConfigChange || !sankeyConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.SANKEY,
            config: sankeyConfig.validConfig,
        });
    }, [sankeyConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigSankey = useMemo(
        () => ({
            chartType: sankeyConfig.chartType,
            chartConfig: sankeyConfig,
            allFields: itemsMap ?? {},
        }),
        [sankeyConfig, itemsMap],
    );

    return children({ visualizationConfig });
};

export default VisualizationSankeyConfig;
