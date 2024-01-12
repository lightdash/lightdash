import { ChartType, DashboardFilters, ItemsMap } from '@lightdash/common';
import { FC, useEffect } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import {
    VisualizationConfig,
    VisualizationConfigCommon,
} from './VisualizationProvider';

export type VisualizationConfigTable = {
    chartType: ChartType.TABLE;
    chartConfig: ReturnType<typeof useTableConfig>;
};

export const isTableVisualizationConfig = (
    visualizationConfig: VisualizationConfig | undefined,
): visualizationConfig is VisualizationConfigTable => {
    return visualizationConfig?.chartType === ChartType.TABLE;
};

type VisualizationTableConfigProps =
    VisualizationConfigCommon<VisualizationConfigTable> & {
        itemsMap: ItemsMap | undefined;
        columnOrder: string[];
        validPivotDimensions: string[] | undefined;
        pivotTableMaxColumnLimit: number;
        savedChartUuid: string | undefined;
        dashboardFilters: DashboardFilters | undefined;
        invalidateCache: boolean | undefined;
    };

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
