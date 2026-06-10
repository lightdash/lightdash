import { getItemId, type MetricQuery, type SortField } from '@lightdash/common';

export const getValidatedDashboardSorts = (
    dashboardSorts: SortField[],
    metricQuery: MetricQuery,
): SortField[] | undefined => {
    if (dashboardSorts.length === 0) {
        return undefined;
    }

    const availableSortFieldIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.tableCalculations.map((tableCalculation) =>
            getItemId(tableCalculation),
        ),
    ]);

    const validSorts = dashboardSorts.filter((sort) =>
        availableSortFieldIds.has(sort.fieldId),
    );

    return validSorts.length > 0 ? validSorts : undefined;
};
