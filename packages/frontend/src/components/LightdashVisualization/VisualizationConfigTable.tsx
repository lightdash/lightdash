import { ChartType } from '@lightdash/common';
import { memo, useMemo, type FC } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import {
    type VisualizationConfigTable,
    type VisualizationTableConfigProps,
} from './types';
import { useEmitChartConfig } from './useEmitChartConfig';

const VisualizationTableConfig: FC<VisualizationTableConfigProps> = ({
    onChartConfigChange,
    onPivotRowsChange,
    children,
}) => {
    const tableConfig = useTableConfig(onPivotRowsChange);

    useEmitChartConfig(
        ChartType.TABLE,
        tableConfig.validConfig,
        onChartConfigChange,
    );

    const visualizationConfig: VisualizationConfigTable = useMemo(
        () => ({
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        }),
        [tableConfig],
    );

    return children({ visualizationConfig });
};

// Memoised so a resize skips it; an echoed config re-renders it, the memoised aggregate spares consumers
export default memo(VisualizationTableConfig);
