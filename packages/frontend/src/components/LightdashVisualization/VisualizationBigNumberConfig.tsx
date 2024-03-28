import {
    ChartType,
    type ItemsMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    type VisualizationConfig,
    type VisualizationConfigCommon,
} from './VisualizationProvider';

export type VisualizationConfigBigNumber = {
    chartType: ChartType.BIG_NUMBER;
    chartConfig: ReturnType<typeof useBigNumberConfig>;
};

export const isBigNumberVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigBigNumber => {
    return visualizationConfig?.chartType === ChartType.BIG_NUMBER;
};

type VisualizationBigNumberConfigProps =
    VisualizationConfigCommon<VisualizationConfigBigNumber> & {
        itemsMap: ItemsMap | undefined;
        tableCalculationsMetadata?: TableCalculationMetadata[];
    };

const VisualizationBigNumberConfig: FC<VisualizationBigNumberConfigProps> = ({
    itemsMap,
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    children,
    tableCalculationsMetadata,
}) => {
    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
        tableCalculationsMetadata,
    );

    useEffect(() => {
        if (!onChartConfigChange || !bigNumberConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.BIG_NUMBER,
            config: bigNumberConfig.validConfig,
        });
    }, [bigNumberConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        },
    });
};

export default VisualizationBigNumberConfig;
