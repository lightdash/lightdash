import {
    ChartType,
    derivePivotConfigurationFromChart,
    pivotConfigurationToColumns,
    type PivotConfiguration,
    type ResultColumnItems,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import {
    selectChartConfig,
    selectPivotDimensions,
} from '../store/sqlRunnerSlice';
import { buildSqlRunnerItems } from './sqlRunnerChart';

/**
 * The result's fields and the pivot the chart asks of the warehouse: the
 * chart's grouping derived the way a saved chart run derives it, addressed
 * by result column so the statement can be re-run pivoted. Null when the
 * chart draws the rows as they are.
 */
export const useSqlRunnerPivotConfiguration = (): {
    items: ResultColumnItems | null;
    pivotConfiguration: PivotConfiguration | null;
} => {
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const chartConfig = useAppSelector(selectChartConfig);
    const pivotDimensions = useAppSelector(selectPivotDimensions);
    const items = useMemo(
        () => (columns ? buildSqlRunnerItems(columns) : null),
        [columns],
    );
    const pivotConfiguration = useMemo(() => {
        if (
            !items ||
            !pivotDimensions?.length ||
            chartConfig.type === ChartType.TABLE
        )
            return null;
        const derived = derivePivotConfigurationFromChart(
            { chartConfig, pivotConfig: { columns: pivotDimensions } },
            items.metricQuery,
            items.itemsMap,
        );
        return derived
            ? pivotConfigurationToColumns(derived, items.columnByFieldId)
            : null;
    }, [items, chartConfig, pivotDimensions]);
    return { items, pivotConfiguration };
};
