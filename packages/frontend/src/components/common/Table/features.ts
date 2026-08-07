import {
    columnGroupingFeature,
    columnOrderingFeature,
    columnPinningFeature,
    columnVisibilityFeature,
    createExpandedRowModel,
    createGroupedRowModel,
    rowAggregationFeature,
    rowExpandingFeature,
    rowPaginationFeature,
    tableFeatures,
} from '@tanstack/react-table';

// Shared feature set for the results table and pivot table. rowAggregationFeature
// is required for cell.getIsAggregated() even though subtotal values come from
// the server, not TanStack aggregation.
export const resultsTableFeatures = tableFeatures({
    columnVisibilityFeature,
    columnOrderingFeature,
    columnPinningFeature,
    rowPaginationFeature,
    columnGroupingFeature,
    rowAggregationFeature,
    rowExpandingFeature,
    expandedRowModel: createExpandedRowModel(),
    groupedRowModel: createGroupedRowModel(),
});

export type ResultsTableFeatures = typeof resultsTableFeatures;
