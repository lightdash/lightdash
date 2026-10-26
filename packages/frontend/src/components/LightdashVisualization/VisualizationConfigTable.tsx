import { ChartType } from '@lightdash/common';
import { useEffect, useMemo, type FC, memo } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import {
    type VisualizationTableConfigProps,
    type VisualizationConfigTable,
} from './types';
import { useVisualizationInputs } from './useVisualizationContext';

const VisualizationTableConfig: FC<VisualizationTableConfigProps> = ({
    initialChartConfig,
    onChartConfigChange,
    onPivotRowsChange,
    children,
}) => {
    const {
        itemsMap,
        resultsData,
        columnOrder,
        pivotDimensions: validPivotDimensions,
        initialPivotRows,
        invalidateCache,
        parameters,
    } = useVisualizationInputs();
    const tableConfig = useTableConfig(
        initialChartConfig,
        resultsData,
        itemsMap,
        columnOrder,
        validPivotDimensions,
        initialPivotRows,
        onPivotRowsChange,
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

    const visualizationConfig: VisualizationConfigTable = useMemo(
        () => ({
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        }),
        [tableConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize or an echoed config does not rebuild the aggregate
export default memo(VisualizationTableConfig);
