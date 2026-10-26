import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import useCartesianChartConfig, {
    useCartesianEditorSync,
} from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import {
    type VisualizationCartesianConfigProps,
    type VisualizationConfigCartesian,
} from './types';

const VisualizationCartesianConfig: FC<VisualizationCartesianConfigProps> = ({
    onChartConfigChange,
    children,
}) => {
    useCartesianEditorSync();
    const cartesianConfig = useCartesianChartConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.CARTESIAN,
            config: cartesianConfig.validConfig,
        });
    }, [cartesianConfig.validConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigCartesian = useMemo(
        () => ({
            chartType: ChartType.CARTESIAN,
            chartConfig: cartesianConfig,
        }),
        [cartesianConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationCartesianConfig);
