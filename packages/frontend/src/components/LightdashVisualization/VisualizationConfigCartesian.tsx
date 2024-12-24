import { ChartType } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useCartesianChartConfig from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type VisualizationCartesianConfigProps } from './types';

const VisualizationCartesianConfig: FC<VisualizationCartesianConfigProps> = ({
    itemsMap,
    resultsData,
    validPivotDimensions,
    columnOrder,
    setPivotDimensions,
    initialChartConfig,
    onChartConfigChange,
    stacking,
    cartesianType,
    colorPalette,
    children,
    tableCalculationsMetadata,
}) => {
    const cartesianConfig = useCartesianChartConfig({
        initialChartConfig,
        pivotKeys: validPivotDimensions,
        resultsData,
        setPivotDimensions,
        columnOrder,
        itemsMap,
        stacking,
        cartesianType,
        colorPalette,
        tableCalculationsMetadata,
    });

    useEffect(() => {
        if (!onChartConfigChange || !cartesianConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.CARTESIAN,
            config: cartesianConfig.validConfig,
        });
    }, [cartesianConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.CARTESIAN,
            chartConfig: cartesianConfig,
        },
    });
};

export default VisualizationCartesianConfig;
