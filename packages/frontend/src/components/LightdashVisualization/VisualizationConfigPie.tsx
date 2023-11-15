import {
    ChartType,
    CustomDimension,
    Dimension,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { FC, useEffect } from 'react';
import usePieChartConfig from '../../hooks/usePieChartConfig';
import { VisualizationConfigCommon } from './VisualizationProvider';

export type VisualizationConfigPie = {
    chartType: ChartType.PIE;
    chartConfig: ReturnType<typeof usePieChartConfig>;
};

type VisualizationConfigPieProps =
    VisualizationConfigCommon<VisualizationConfigPie> & {
        dimensions: Dimension[];
        allNumericMetrics: (Metric | TableCalculation)[];
        customDimensions: CustomDimension[];
    };

const VisualizationPieConfig: FC<VisualizationConfigPieProps> = ({
    explore,
    resultsData,
    dimensions,
    allNumericMetrics,
    customDimensions,
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const pieChartConfig = usePieChartConfig(
        explore,
        resultsData,
        initialChartConfig,
        dimensions,
        allNumericMetrics,
        customDimensions,
    );

    useEffect(() => {
        onChartConfigChange?.(pieChartConfig.validConfig);
    }, [pieChartConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.PIE,
            chartConfig: pieChartConfig,
        },
    });
};

export default VisualizationPieConfig;
