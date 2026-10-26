import { ChartType } from '@lightdash/common';
import { memo, useEffect, useMemo, type FC } from 'react';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import {
    type VisualizationConfigTable,
    type VisualizationTableConfigProps,
} from './types';

const VisualizationTableConfig: FC<VisualizationTableConfigProps> = ({
    onChartConfigChange,
    onPivotRowsChange,
    children,
}) => {
    const tableConfig = useTableConfig(onPivotRowsChange);

    useEffect(() => {
        if (!onChartConfigChange) return;
        onChartConfigChange({
            type: ChartType.TABLE,
            config: tableConfig.validConfig,
        });
    }, [tableConfig.validConfig, onChartConfigChange]);

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
