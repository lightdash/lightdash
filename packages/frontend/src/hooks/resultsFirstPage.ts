import {
    ChartType,
    DEFAULT_RESULTS_PAGE_SIZE,
    type MetricQuery,
    type PivotConfiguration,
    type SavedChart,
} from '@lightdash/common';

export const RESULTS_FIRST_PAGE_CELL_BUDGET = 50_000;

const MIN_FIRST_PAGE_ROWS = 25;

export const getFirstResultsPageSize = (columnCount?: number): number => {
    if (!columnCount || columnCount <= 0) return DEFAULT_RESULTS_PAGE_SIZE;
    const rowsInBudget = Math.floor(
        RESULTS_FIRST_PAGE_CELL_BUDGET / columnCount,
    );
    return Math.min(
        DEFAULT_RESULTS_PAGE_SIZE,
        Math.max(MIN_FIRST_PAGE_ROWS, rowsInBudget),
    );
};

export const getUnpivotedColumnCount = (
    metricQuery: Pick<
        MetricQuery,
        'dimensions' | 'metrics' | 'tableCalculations'
    >,
    pivotConfiguration?: PivotConfiguration | null,
): number | undefined => {
    if (pivotConfiguration) return undefined;
    return (
        metricQuery.dimensions.length +
        metricQuery.metrics.length +
        metricQuery.tableCalculations.length
    );
};

export const getTableTileFirstPageColumnCount = (
    chart: Pick<SavedChart, 'chartConfig' | 'pivotConfig'> | undefined,
    metricQuery: MetricQuery | undefined,
): number | undefined => {
    if (!chart || !metricQuery) return undefined;
    if (chart.chartConfig.type !== ChartType.TABLE) return undefined;
    if (chart.pivotConfig?.columns?.length) return undefined;
    return getUnpivotedColumnCount(metricQuery);
};
