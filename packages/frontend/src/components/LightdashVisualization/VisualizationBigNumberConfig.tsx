import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, type FC, memo } from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import {
    type VisualizationBigNumberConfigProps,
    type VisualizationConfigBigNumber,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationBigNumberConfig: FC<VisualizationBigNumberConfigProps> = ({
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const { itemsMap, resultsData, tableCalculationsMetadata, parameters } =
        useVisualizationInputs();
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

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationBigNumberConfig);
