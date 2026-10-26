import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import {
    type VisualizationCustomConfigProps,
    type VisualizationCustomConfigType,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';

const VisualizationCustomConfig: FC<VisualizationCustomConfigProps> = ({
    onChartConfigChange,
    children,
}) => {
    const customVisConfig = useCustomVisualizationConfig();

    useEmitChartConfig(
        ChartType.CUSTOM,
        customVisConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationCustomConfigType = useMemo(
        () => ({
            chartType: ChartType.CUSTOM,
            chartConfig: customVisConfig,
        }),
        [customVisConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationCustomConfig);
