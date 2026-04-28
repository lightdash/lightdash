import type { PivotConfiguration, SortOnlyDimension } from '../types/pivot';
import type { SortBy, ValuesColumn } from '../types/sqlRunner';
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

// True when the user's sort drives pivot column ordering: the sort field is
// either a pivot dimension, or the backend has acknowledged it as a non-index
// column sort (a sort-only companion dim).
export const isSortedByPivot = ({
    pivotDimensions,
    sorts,
    pivotDetails,
}: {
    pivotDimensions: string[] | undefined;
    sorts: { fieldId: string }[] | undefined;
    pivotDetails:
        | {
              indexColumn?: PivotConfiguration['indexColumn'];
              sortBy?: SortBy;
          }
        | null
        | undefined;
}): boolean => {
    if (!pivotDimensions?.length) return false;
    if (!sorts?.length) return false;

    const indexColumnRefs = new Set(
        normalizeIndexColumns(pivotDetails?.indexColumn).map(
            (c) => c.reference,
        ),
    );
    const pivotSortRefs = new Set(
        pivotDetails?.sortBy?.map((s) => s.reference) ?? [],
    );

    return sorts.some(
        (sort) =>
            pivotDimensions.includes(sort.fieldId) ||
            (pivotSortRefs.has(sort.fieldId) &&
                !indexColumnRefs.has(sort.fieldId)),
    );
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
