import { ChartType } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import { type VisualizationTableConfigProps } from './types';

const VisualizationTableConfig: FC<VisualizationTableConfigProps> = ({
    itemsMap,
    resultsData,
    columnOrder,
    validPivotDimensions,
    pivotTableMaxColumnLimit,
    initialChartConfig,
    onChartConfigChange,
    children,
    savedChartUuid,
    dashboardFilters,
    invalidateCache,
    parameters,
}) => {
    const tableConfig = useTableConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
        columnOrder,
        validPivotDimensions,
        pivotTableMaxColumnLimit,
        savedChartUuid,
        dashboardFilters,
        invalidateCache,
        parameters,
    );

    useEffect(() => {
        if (!onChartConfigChange || !tableConfig.validConfig) return;

        onChartConfigChange({
            type: ChartType.TABLE,
            config: tableConfig.validConfig,
        });
    }, [tableConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        },
    });
};

export default VisualizationTableConfig;
