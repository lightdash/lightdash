import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import {
    type VisualizationCustomConfigProps,
    type VisualizationCustomConfigType,
} from './types';

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

    const visualizationConfig: VisualizationCustomConfigType = useMemo(
        () => ({
            chartType: ChartType.CUSTOM,
            chartConfig: customVisConfig,
        }),
        [customVisConfig],
    );

    return children({ visualizationConfig });
};

export default VisualizationCustomConfig;
