import { ChartType } from '@lightdash/common';
import { getSankeyFields } from '@lightdash/visualization/editor';
import { useEffect, useMemo, type FC, memo } from 'react';
import useSankeyChartConfig from '../../hooks/useSankeyChartConfig';
import {
    type VisualizationConfigSankeyProps,
    type VisualizationConfigSankeyType,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationConfigSankey: FC<VisualizationConfigSankeyProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const { resultsData, itemsMap, colorPalette, tableCalculationsMetadata } =
        useVisualizationInputs();
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

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationConfigSankey);
