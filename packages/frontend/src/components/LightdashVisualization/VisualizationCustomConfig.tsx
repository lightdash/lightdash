import { ChartType, type ItemsMap } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import {
    type VisualizationConfig,
    type VisualizationConfigCommon,
} from './VisualizationProvider';

export type VisualizationCustomConfigType = {
    chartType: ChartType.CUSTOM;
    chartConfig: ReturnType<typeof useCustomVisualizationConfig>;
};

export const isCustomVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationCustomConfigType => {
    return visualizationConfig?.chartType === ChartType.CUSTOM;
};

type VisualizationCustomConfigProps =
    VisualizationConfigCommon<VisualizationCustomConfigType> & {
        // TODO: shared prop once all visualizations are converted
        itemsMap?: ItemsMap | undefined;
    };

const VisualizationCustomConfig: FC<VisualizationCustomConfigProps> = ({
    initialChartConfig,
    resultsData,
    onChartConfigChange,
    children,
}) => {
    const customVisConfig = useCustomVisualizationConfig(
        initialChartConfig,
        resultsData,
    );

    useEffect(() => {
        if (!onChartConfigChange || !customVisConfig) return;
        onChartConfigChange({
            type: ChartType.CUSTOM,
            config: {
                spec: customVisConfig.validConfig.spec,
            },
        });
    }, [customVisConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.CUSTOM,
            chartConfig: customVisConfig,
        },
    });
};

export default VisualizationCustomConfig;
