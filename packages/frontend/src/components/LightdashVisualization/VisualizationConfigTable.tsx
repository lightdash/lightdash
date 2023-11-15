import { ChartType } from '@lightdash/common';
import { FC, useEffect } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import { VisualizationConfigCommon } from './VisualizationProvider';

export type VisualizationConfigTable = {
    chartType: ChartType.TABLE;
    chartConfig: ReturnType<typeof useTableConfig>;
};

type VisualizationTableConfigProps =
    VisualizationConfigCommon<VisualizationConfigTable> & {
        columnOrder: string[];
        validPivotDimensions: string[] | undefined;
        pivotTableMaxColumnLimit: number;
    };

const VisualizationTableConfig: FC<VisualizationTableConfigProps> = ({
    explore,
    resultsData,
    columnOrder,
    validPivotDimensions,
    pivotTableMaxColumnLimit,
    initialChartConfig,
    onChartConfigChange,
    children,
}) => {
    const tableConfig = useTableConfig(
        initialChartConfig,
        resultsData,
        explore,
        columnOrder,
        validPivotDimensions,
        pivotTableMaxColumnLimit,
    );

    useEffect(() => {
        if (!onChartConfigChange || !tableConfig.validConfig) return;
        onChartConfigChange(tableConfig.validConfig);
    }, [tableConfig, onChartConfigChange]);

    return children({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        },
    });
};

export default VisualizationTableConfig;
