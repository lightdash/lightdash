import { assertUnreachable } from '@lightdash/common';
import { Limit } from './types';

export const LARGE_EXPORT_CELLS_WARNING_THRESHOLD = 5_000_000;

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

export const isLargeExport = (
    cellEstimate: number | null,
): cellEstimate is number =>
    cellEstimate !== null &&
    cellEstimate >= LARGE_EXPORT_CELLS_WARNING_THRESHOLD;

export const getExportTimeoutMinutes = (
    exportTimeoutMs: number | undefined,
): number | null => {
    if (!exportTimeoutMs || exportTimeoutMs <= 0) return null;
    return Math.max(1, Math.round(exportTimeoutMs / 60_000));
};
