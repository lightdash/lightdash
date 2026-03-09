import {
    ChartType,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type TableCalculation,
} from '@lightdash/common';
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
    const { dimensions, numericFields } = useMemo(() => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);

        const numericTableCalculations = Object.keys(tableCalculations).reduce<
            Record<string, TableCalculation>
        >((acc, key) => {
            const tableCalculation = tableCalculations[key];
            if (isNumericItem(tableCalculation)) {
                acc[key] = tableCalculation;
            }
            return acc;
        }, {});

        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericFields: { ...metrics, ...numericTableCalculations },
        };
    }, [itemsMap]);

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
