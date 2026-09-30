import { ChartType } from '@lightdash/common';
import { getSankeyFields } from '@lightdash/visualization/editor';
import { useEffect, useMemo, type FC } from 'react';
import useSankeyChartConfig from '../../hooks/useSankeyChartConfig';
import { type VisualizationConfigSankeyProps } from './types';

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

    return children({
        visualizationConfig: {
            chartType: ChartType.SANKEY,
            chartConfig: sankeyChartConfig,
            dimensions,
            numericFields,
        },
    });
};

export default VisualizationConfigSankey;
