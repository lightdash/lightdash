import type { PivotConfiguration, SortOnlyDimension } from '../types/pivot';
import type { ValuesColumn } from '../types/sqlRunner';
import type { PivotIndexColum } from '../visualizations/types';

export const normalizeIndexColumns = (
    indexColumn: PivotConfiguration['indexColumn'],
): PivotIndexColum[] => {
    if (!indexColumn) {
        return [];
    }
    if (Array.isArray(indexColumn)) {
        return indexColumn;
    }
    return [indexColumn];
};

export const getFirstIndexColumns = (
    indexColumn: PivotConfiguration['indexColumn'],
): PivotIndexColum | undefined => {
    const normalizedIndexColumns = normalizeIndexColumns(indexColumn);
    return normalizedIndexColumns[0];
};

// Items in sortOnlyColumns that carry an `aggregation` (metrics or table
// calcs needed for sort-anchor CTEs).
export const getSortOnlyValuesColumns = (
    sortOnlyColumns: PivotConfiguration['sortOnlyColumns'],
): ValuesColumn[] =>
    (sortOnlyColumns ?? []).filter(
        (col): col is ValuesColumn => 'aggregation' in col,
    );

// Items in sortOnlyColumns that don't carry an `aggregation` (dimensions
// that ride through group_by_query to drive column_index ORDER BY).
export const getSortOnlyDimensionColumns = (
    sortOnlyColumns: PivotConfiguration['sortOnlyColumns'],
): SortOnlyDimension[] =>
    (sortOnlyColumns ?? []).filter(
        (col): col is SortOnlyDimension => !('aggregation' in col),
    );

// True when the user's sort drives pivot column ordering: the sort field is
// either a pivot dimension, or a sort-only companion dimension that the
// backend carries through group_by_query to drive column_index ORDER BY.
export const isSortedByPivot = ({
    pivotDimensions,
    sorts,
    pivotDetails,
}: {
    pivotDimensions?: string[];
    sorts?: { fieldId: string }[];
    pivotDetails?: {
        sortOnlyColumns?: PivotConfiguration['sortOnlyColumns'];
    } | null;
}): boolean => {
    if (!pivotDimensions?.length) return false;
    if (!sorts?.length) return false;

    const sortOnlyDimRefs = new Set(
        getSortOnlyDimensionColumns(pivotDetails?.sortOnlyColumns).map(
            (c) => c.reference,
        ),
    );

    return sorts.some(
        (sort) =>
            pivotDimensions.includes(sort.fieldId) ||
            sortOnlyDimRefs.has(sort.fieldId),
    );
};
