import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, type FC, memo } from 'react';
import useCustomVisualizationConfig from '../../hooks/useCustomVisualizationConfig';
import {
    type VisualizationCustomConfigProps,
    type VisualizationCustomConfigType,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationCustomConfig: FC<VisualizationCustomConfigProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const { resultsData } = useVisualizationInputs();
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

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationCustomConfig);
