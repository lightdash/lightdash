import {
    columnFilteringFeature,
    columnOrderingFeature,
    columnResizingFeature,
    columnSizingFeature,
    columnVisibilityFeature,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    filterFns,
    globalFilteringFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    sortFns,
    tableFeatures,
} from '@tanstack/react-table';

// Full sortFns/filterFns registries keep v8's string-name lookups
// ('alphanumeric', 'includesString', ...) working for every caller.
export const contentTableFeatures = tableFeatures({
    columnVisibilityFeature,
    columnOrderingFeature,
    columnSizingFeature,
    columnResizingFeature,
    rowSortingFeature,
    columnFilteringFeature,
    globalFilteringFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    sortedRowModel: createSortedRowModel(),
    filteredRowModel: createFilteredRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    sortFns,
    filterFns,
});

export type ContentTableFeatures = typeof contentTableFeatures;
