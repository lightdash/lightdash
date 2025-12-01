import { ChartType } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import useMapChartConfig from '../../hooks/useMapChartConfig';
import {
    type VisualizationConfigMap,
    type VisualizationConfigMapProps,
} from './types';

const VisualizationMapConfig: React.FC<VisualizationConfigMapProps> = ({
    itemsMap,
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const mapConfig = useMapChartConfig(initialChartConfig as any, itemsMap);

    useEffect(() => {
        if (!onChartConfigChange || !mapConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.MAP,
            config: mapConfig.validConfig,
        });
    }, [mapConfig.validConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigMap = useMemo(
        () => ({
            chartType: ChartType.MAP,
            chartConfig: mapConfig,
        }),
        [mapConfig],
    );

    return children({ visualizationConfig });
};

export default VisualizationMapConfig;
