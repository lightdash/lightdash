import { assertUnreachable } from '@lightdash/common';
import { Limit } from './types';

export const LARGE_EXPORT_CELLS_WARNING_THRESHOLD = 5_000_000;

const DEFAULT_EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

type ExportCellEstimateArgs = {
    limit: Limit;
    customLimit: number;
    totalResults: number;
    columnOrder: string[];
    hiddenFields: string[];
    csvCellsLimit: number;
};

const getExportRowCount = (
    limit: Limit,
    customLimit: number,
    totalResults: number,
): number => {
    switch (limit) {
        case Limit.TABLE:
        case Limit.ALL:
            return totalResults;
        case Limit.CUSTOM:
            return Math.min(customLimit, totalResults);
        default:
            return assertUnreachable(limit, `Unknown export limit ${limit}`);
    }
};

export const getExportCellEstimate = ({
    limit,
    customLimit,
    totalResults,
    columnOrder,
    hiddenFields,
    csvCellsLimit,
}: ExportCellEstimateArgs): number | null => {
    const hiddenFieldIds = new Set(hiddenFields);
    const columnCount = columnOrder.filter(
        (fieldId) => !hiddenFieldIds.has(fieldId),
    ).length;
    if (columnCount === 0) return null;
    const rowCount = getExportRowCount(limit, customLimit, totalResults);
    return Math.min(rowCount * columnCount, csvCellsLimit);
};

/**
 * Rows an export keeps under the cell limit. Mirrors the backend's
 * `getCellLimitedRowCount`, which counts every query column (hidden ones
 * included), so pass the full column order here.
 */
export const getCellLimitedRowCount = (
    csvCellsLimit: number,
    columnCount: number,
): number => Math.floor(csvCellsLimit / Math.max(columnCount, 1));

/**
 * Rows the selected scope asks the download for, or null when it can't be
 * known up front ("All results" reruns the query without a row limit, so it
 * returns at least `totalResults` rows but possibly more).
 */
export const getRequestedExportRowCount = (
    limit: Limit,
    customLimit: number,
    totalResults: number,
): number | null => {
    switch (limit) {
        case Limit.TABLE:
            return totalResults;
        case Limit.CUSTOM:
            return customLimit;
        case Limit.ALL:
            return null;
        default:
            return assertUnreachable(limit, `Unknown export limit ${limit}`);
    }
};

/**
 * Scopes whose download reruns the query with the cell cap applied. "Table
 * rows" usually streams the already-run query's stored results as they are,
 * so it isn't capped. Callers whose downloads behave differently pass their
 * own scopes to `ExportResults`.
 */
export const DEFAULT_CELL_LIMITED_SCOPES: readonly Limit[] = [
    Limit.ALL,
    Limit.CUSTOM,
];

/** Every scope reruns the query with the cell cap. */
export const ALL_CELL_LIMITED_SCOPES: readonly Limit[] = [
    Limit.TABLE,
    Limit.ALL,
    Limit.CUSTOM,
];

/** No scope is capped: SQL queries bypass the cell limit, and downloads of an
 *  already-run query stream its stored results. */
export const NO_CELL_LIMITED_SCOPES: readonly Limit[] = [];

export const isLargeExport = (
    cellEstimate: number | null,
): cellEstimate is number =>
    cellEstimate !== null &&
    cellEstimate >= LARGE_EXPORT_CELLS_WARNING_THRESHOLD;

export const getExportTimeoutMinutes = (
    exportTimeoutMs: number | undefined,
): number => {
    const timeoutMs =
        exportTimeoutMs !== undefined &&
        Number.isFinite(exportTimeoutMs) &&
        exportTimeoutMs > 0
            ? exportTimeoutMs
            : DEFAULT_EXPORT_TIMEOUT_MS;
    return Math.max(1, Math.round(timeoutMs / 60_000));
};
