import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    type VisualizationBigNumberConfigProps,
    type VisualizationConfigBigNumber,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';

const VisualizationBigNumberConfig: FC<VisualizationBigNumberConfigProps> = ({
    onChartConfigChange,
    children,
}) => {
    const bigNumberConfig = useBigNumberConfig();

    useEmitChartConfig(
        ChartType.BIG_NUMBER,
        bigNumberConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationConfigBigNumber = useMemo(
        () => ({
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        }),
        [bigNumberConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationBigNumberConfig);
