import {
    ChartType,
    CustomDimension,
    Dimension,
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    ItemsMap,
    Metric,
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
    dimensions: (Dimension | CustomDimension)[];
    metrics: Metric[];
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
    };

const VisualizationPieConfig: FC<VisualizationConfigPieProps> = ({
    explore,
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    itemsMap,
    children,
}) => {
    const { dimensions, metrics } = useMemo(
        () => ({
            dimensions: itemsMap
                ? Object.values(getDimensionsFromItemsMap(itemsMap))
                : [],
            metrics: itemsMap
                ? Object.values(getMetricsFromItemsMap(itemsMap))
                : [],
        }),
        [itemsMap],
    );

    const pieChartConfig = usePieChartConfig(
        explore,
        resultsData,
        initialChartConfig,
        itemsMap,
        dimensions,
        metrics,
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
            metrics,
        },
    });
};

export default VisualizationPieConfig;
