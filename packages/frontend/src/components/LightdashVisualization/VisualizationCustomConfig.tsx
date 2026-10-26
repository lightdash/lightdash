import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import {
    type VisualizationCustomConfigProps,
    type VisualizationCustomConfigType,
} from './types';

const VisualizationCustomConfig: FC<VisualizationCustomConfigProps> = ({
    onChartConfigChange,
    children,
}) => {
    const customVisConfig = useCustomVisualizationConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.CUSTOM,
            config: customVisConfig.validConfig,
        });
    }, [customVisConfig.validConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationCustomConfigType = useMemo(
        () => ({
            chartType: ChartType.CUSTOM,
            chartConfig: customVisConfig,
        }),
        [customVisConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationCustomConfig);
