import { ChartType } from '@lightdash/common';
import { getSankeyFields } from '@lightdash/visualization/editor';
import { useEffect, useMemo, type FC } from 'react';
import useSankeyChartConfig from '../../hooks/useSankeyChartConfig';
import {
    type VisualizationConfigSankeyProps,
    type VisualizationConfigSankeyType,
} from './types';

const VisualizationConfigSankey: FC<VisualizationConfigSankeyProps> = ({
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    itemsMap,
    colorPalette,
    children,
    tableCalculationsMetadata,
}) => {
    const { dimensions, numericFields } = useMemo(
        () => getSankeyFields(itemsMap),
        [itemsMap],
    );

    const sankeyChartConfig = useSankeyChartConfig(
        resultsData,
        initialChartConfig,
        itemsMap,
        dimensions,
        numericFields,
        colorPalette,
        tableCalculationsMetadata,
    );

    useEffect(() => {
        if (!onChartConfigChange || !sankeyChartConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.SANKEY,
            config: sankeyChartConfig.validConfig,
        });
    }, [sankeyChartConfig, onChartConfigChange]);

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

export default VisualizationConfigSankey;
