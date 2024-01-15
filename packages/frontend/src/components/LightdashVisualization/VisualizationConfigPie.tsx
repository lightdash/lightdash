import {
    ChartType,
    CustomDimension,
    Dimension,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    isNumericItem,
    isTableCalculation,
    ItemsMap,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { FC, useEffect, useMemo } from 'react';
import usePieChartConfig from '../../hooks/usePieChartConfig';
import {
    VisualizationConfig,
    VisualizationConfigCommon,
} from './VisualizationProvider';

export type VisualizationConfigPie = {
    chartType: ChartType.PIE;
    chartConfig: ReturnType<typeof usePieChartConfig>;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericMetrics: Record<string, Metric | TableCalculation>;
};

export const isPieVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigPie => {
    return visualizationConfig?.chartType === ChartType.PIE;
};

type VisualizationConfigPieProps =
    VisualizationConfigCommon<VisualizationConfigPie> & {
        // TODO: shared prop once all visualizations are converted
        itemsMap: ItemsMap | undefined;
        colorPalette: string[];
    };

const VisualizationPieConfig: FC<VisualizationConfigPieProps> = ({
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    itemsMap,
    colorPalette,
    children,
}) => {
    const { dimensions, numericMetrics } = useMemo(() => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = Object.entries(itemsMap ?? {}).reduce<
            Record<string, TableCalculation>
        >((acc, [key, value]) => {
            if (isTableCalculation(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        }, {});

        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericMetrics: { ...metrics, ...tableCalculations },
        };
    }, [itemsMap]);

    const pieChartConfig = usePieChartConfig(
        resultsData,
        initialChartConfig,
        itemsMap,
        dimensions,
        numericMetrics,
        colorPalette,
    );

    useEffect(() => {
        if (!onChartConfigChange || !pieChartConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.PIE,
            config: pieChartConfig.validConfig,
        });
    }, [pieChartConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.PIE,
            chartConfig: pieChartConfig,
            dimensions,
            numericMetrics,
        },
    });
};

export default VisualizationPieConfig;
