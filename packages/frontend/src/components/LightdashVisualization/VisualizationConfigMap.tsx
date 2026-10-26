import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import useMapChartConfig from '../../hooks/useMapChartConfig';
import {
    type VisualizationConfigMap,
    type VisualizationConfigMapProps,
} from './types';

const VisualizationMapConfig: FC<VisualizationConfigMapProps> = ({
    onChartConfigChange,
    children,
}) => {
    const mapConfig = useMapChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
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

// Memoised so a resize skips it; an echoed config still re-renders it (new chartConfig in its props)
export default memo(VisualizationMapConfig);
