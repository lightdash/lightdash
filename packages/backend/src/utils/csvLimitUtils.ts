import { MetricQuery, ParameterError } from '@lightdash/common';

const DEFAULT_CSV_CELLS_LIMIT = 100000;

const getMetricQueryColumnCount = (
    metricQuery: Pick<
        MetricQuery,
        'dimensions' | 'metrics' | 'tableCalculations'
    >,
): number =>
    metricQuery.dimensions.length +
    metricQuery.metrics.length +
    metricQuery.tableCalculations.length;

const getCellLimitedRowCount = (
    csvCellsLimit: number,
    numberColumns: number,
): number => Math.floor(csvCellsLimit / Math.max(numberColumns, 1));

/**
 * Applies CSV limit to a metric query.
 *
 * When csvLimit is:
 * - undefined: Returns the original metricQuery with limit validation against maxLimit
 * - null: Applies csvCellsLimit to get all results within the configured cell limit
 * - number: Applies the specific limit, capped at csvCellsLimit
 *
 * @param metricQuery - The metric query to apply limit to
 * @param csvLimit - The requested limit (undefined = use existing, null = all results, number = specific limit)
 * @param csvCellsLimit - The configured maximum number of cells allowed
 * @param maxLimit - The configured maximum query limit (only checked when csvLimit is undefined)
 * @returns The metric query with the appropriate limit applied
 */
export function metricQueryWithLimit(
    metricQuery: MetricQuery,
    csvLimit: number | null | undefined,
    csvCellsLimit: number = DEFAULT_CSV_CELLS_LIMIT,
    maxLimit?: number,
): MetricQuery {
    if (csvLimit === undefined) {
        if (maxLimit !== undefined && metricQuery.limit > maxLimit) {
            throw new ParameterError(`Query limit can not exceed ${maxLimit}`);
        }
        return metricQuery;
    }

    const numberColumns = getMetricQueryColumnCount(metricQuery);
    if (numberColumns === 0)
        throw new ParameterError(
            'Query must have at least one dimension, metric, or table calculation',
        );
    const maxRows = getCellLimitedRowCount(csvCellsLimit, numberColumns);
    const csvRowLimit =
        csvLimit === null ? maxRows : Math.min(csvLimit, maxRows);

    return {
        ...metricQuery,
        limit: csvRowLimit,
    };
}

/**
 * Whether stored export results were cut short by the cell limit. Export
 * queries apply the cap as their row limit (see `metricQueryWithLimit`), so
 * the results file itself never shows it: a query whose limit equals the cap
 * and whose rows filled it may have had more rows behind it.
 */
export function isCellLimitTruncated({
    metricQuery,
    totalRowCount,
    csvCellsLimit,
}: {
    metricQuery: Pick<
        MetricQuery,
        'dimensions' | 'metrics' | 'tableCalculations' | 'limit'
    >;
    totalRowCount: number | null;
    csvCellsLimit: number;
}): boolean {
    const numberColumns = getMetricQueryColumnCount(metricQuery);
    if (numberColumns === 0 || totalRowCount === null) return false;

    const cellLimitedRows = getCellLimitedRowCount(
        csvCellsLimit,
        numberColumns,
    );
    return (
        metricQuery.limit === cellLimitedRows &&
        totalRowCount >= cellLimitedRows
    );
}
