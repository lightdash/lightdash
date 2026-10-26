import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import {
    selectCartesianIntent,
    useVisualizationSelector,
} from '../../features/visualization/store';
import useCartesianChartConfig from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import {
    type VisualizationCartesianConfigProps,
    type VisualizationConfigCartesian,
} from './types';

const VisualizationCartesianConfig: FC<VisualizationCartesianConfigProps> = ({
    itemsMap,
    resultsData,
    validPivotDimensions,
    columnOrder,
    initialChartConfig,
    onChartConfigChange,
    colorPalette,
    children,
    tableCalculationsMetadata,
    unsavedMetricQuery,
}) => {
    const { stacking, cartesianType } = useVisualizationSelector(
        selectCartesianIntent,
    );
    const cartesianConfig = useCartesianChartConfig({
        initialChartConfig,
        pivotKeys: validPivotDimensions,
        resultsData,
        columnOrder,
        itemsMap,
        stacking,
        cartesianType,
        colorPalette,
        tableCalculationsMetadata,
        unsavedMetricQuery,
    });

    useEffect(() => {
        if (!onChartConfigChange || !cartesianConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.CARTESIAN,
            config: cartesianConfig.validConfig,
        });
    }, [cartesianConfig, onChartConfigChange]);

    const visualizationConfig: VisualizationConfigCartesian = useMemo(
        () => ({
            chartType: ChartType.CARTESIAN,
            chartConfig: cartesianConfig,
        }),
        [cartesianConfig],
    );

    return children({ visualizationConfig });
};

export default VisualizationCartesianConfig;
