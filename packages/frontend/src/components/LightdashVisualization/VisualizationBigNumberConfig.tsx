import { ChartType, ItemsMap } from '@lightdash/common';
import { FC, useEffect } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    VisualizationConfig,
    VisualizationConfigCommon,
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
    };

const VisualizationBigNumberConfig: FC<VisualizationBigNumberConfigProps> = ({
    itemsMap,
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
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
