import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    type VisualizationBigNumberConfigProps,
    type VisualizationConfigBigNumber,
} from './types';

const VisualizationBigNumberConfig: FC<VisualizationBigNumberConfigProps> = ({
    onChartConfigChange,
    children,
}) => {
    const bigNumberConfig = useBigNumberConfig();

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.BIG_NUMBER,
            config: bigNumberConfig.validConfig,
        });
    }, [bigNumberConfig.validConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigBigNumber = useMemo(
        () => ({
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        }),
        [bigNumberConfig],
    );

    return children({ visualizationConfig });
};

// Skips provider re-renders that keep its props, e.g. a resize; an echoed config still re-renders it
export default memo(VisualizationBigNumberConfig);
