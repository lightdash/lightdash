import { ChartType } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import { type VisualizationBigNumberConfigProps } from './types';

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

    return children({
        visualizationConfig: {
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        },
    });
};

export default VisualizationBigNumberConfig;
