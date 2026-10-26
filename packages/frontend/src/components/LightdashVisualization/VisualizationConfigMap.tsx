import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import useMapChartConfig from '../../hooks/useMapChartConfig';
import {
    type VisualizationConfigMap,
    type VisualizationConfigMapProps,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';

const VisualizationMapConfig: FC<VisualizationConfigMapProps> = ({
    onChartConfigChange,
    children,
}) => {
    const mapConfig = useMapChartConfig();

    useEmitChartConfig(
        ChartType.MAP,
        mapConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationConfigMap = useMemo(
        () => ({
            chartType: ChartType.MAP,
            chartConfig: mapConfig,
        }),
        [mapConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationMapConfig);
