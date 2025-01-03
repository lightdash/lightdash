import { ChartType } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import { type VisualizationCustomConfigProps } from './types';

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
