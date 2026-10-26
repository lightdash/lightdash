import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, memo } from 'react';
import useMapChartConfig from '../../hooks/useMapChartConfig';
import {
    type VisualizationConfigMap,
    type VisualizationConfigMapProps,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationMapConfig: React.FC<VisualizationConfigMapProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const { itemsMap } = useVisualizationInputs();
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

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationMapConfig);
