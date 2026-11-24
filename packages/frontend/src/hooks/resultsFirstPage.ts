import {
    ChartType,
    DEFAULT_RESULTS_PAGE_SIZE,
    SessionStorageKeys,
    type ChartConfig,
    type MetricQuery,
    type PivotConfiguration,
    type SavedChart,
    type TableChart,
} from '@lightdash/common';
import { COLUMN_WIDTH_SAMPLE_ROWS } from '../components/common/Table/measureColumnWidth';

export const RESULTS_FIRST_PAGE_CELL_BUDGET = 50_000;

const MIN_FIRST_PAGE_ROWS = COLUMN_WIDTH_SAMPLE_ROWS;

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

export const isCaptureRender = (): boolean => {
    try {
        return (
            window.sessionStorage.getItem(
                SessionStorageKeys.HEADLESS_CAPTURE,
            ) === 'true'
        );
    } catch {
        return false;
    }
};

export const tableNeedsAllRows = (
    config: Pick<TableChart, 'showSubtotals' | 'rowLimit'> | undefined,
): boolean => {
    if (!config) return false;
    if (config.showSubtotals) return true;
    const { rowLimit } = config;
    return (
        rowLimit != null &&
        rowLimit.count > 0 &&
        (rowLimit.direction === 'last' || rowLimit.mode === 'hide')
    );
};

export const canUseSmallerFirstPage = ({
    chartConfig,
    pivotColumns,
    captureMode = false,
}: {
    chartConfig: ChartConfig | undefined;
    pivotColumns?: string[];
    captureMode?: boolean;
}): boolean => {
    if (captureMode) return false;
    if (chartConfig?.type !== ChartType.TABLE) return false;
    if (pivotColumns?.length) return false;
    return !tableNeedsAllRows(chartConfig.config);
};

export const getExplorerProgressiveFirstPage = ({
    chartConfig,
    pivotColumns,
    minimal,
    captureMode,
}: {
    chartConfig: ChartConfig;
    pivotColumns?: string[];
    minimal: boolean;
    captureMode: boolean;
}): { main: boolean; unpivoted: boolean } => ({
    main:
        !minimal &&
        canUseSmallerFirstPage({ chartConfig, pivotColumns, captureMode }),
    unpivoted: !minimal && !captureMode,
});

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
    { captureMode = false }: { captureMode?: boolean } = {},
): number | undefined => {
    if (!chart || !metricQuery) return undefined;
    if (
        !canUseSmallerFirstPage({
            chartConfig: chart.chartConfig,
            pivotColumns: chart.pivotConfig?.columns,
            captureMode,
        })
    ) {
        return undefined;
    }
    return getUnpivotedColumnCount(metricQuery);
};
