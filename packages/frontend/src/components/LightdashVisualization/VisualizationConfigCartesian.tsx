import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import useCartesianChartConfig, {
    useCartesianEditorSync,
} from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import {
    type VisualizationCartesianConfigProps,
    type VisualizationConfigCartesian,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';

const VisualizationCartesianConfig: FC<VisualizationCartesianConfigProps> = ({
    onChartConfigChange,
    children,
}) => {
    useCartesianEditorSync();
    const cartesianConfig = useCartesianChartConfig();

    useEmitChartConfig(
        ChartType.CARTESIAN,
        cartesianConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationConfigCartesian = useMemo(
        () => ({
            chartType: ChartType.CARTESIAN,
            chartConfig: cartesianConfig,
        }),
        [cartesianConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationCartesianConfig);
