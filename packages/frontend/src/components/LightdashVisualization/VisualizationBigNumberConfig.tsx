import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    type VisualizationBigNumberConfigProps,
    type VisualizationConfigBigNumber,
} from './types';

const VisualizationBigNumberConfig: FC<VisualizationBigNumberConfigProps> = ({
    itemsMap,
    resultsData,
    initialChartConfig,
    onChartConfigChange,
    children,
    tableCalculationsMetadata,
    parameters,
}) => {
    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
        tableCalculationsMetadata,
        parameters,
    );

    useEffect(() => {
        if (!onChartConfigChange || !bigNumberConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.BIG_NUMBER,
            config: bigNumberConfig.validConfig,
        });
    }, [bigNumberConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigBigNumber = useMemo(
        () => ({
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        }),
        [bigNumberConfig],
    );

    return children({ visualizationConfig });
};

export default VisualizationBigNumberConfig;
