import {
    getDashboardBoundaryErrors,
    getFilterBoundaryFieldContext,
    getItemId,
    resolveQueryTimezone,
    type DashboardFilterableField,
    type DashboardFilters,
    type FilterBoundaryContext,
    type MetricQuery,
} from '@lightdash/common';

export const getDashboardChartBoundaryErrors = ({
    savedFilters,
    filters,
    charts,
    projectTimezone,
    sessionTimezone,
    userTimezone,
    context,
}: {
    savedFilters: DashboardFilters;
    filters: DashboardFilters;
    charts: {
        tileUuid: string;
        metricQuery: Pick<MetricQuery, 'timezone'>;
        fields: DashboardFilterableField[];
    }[];
    projectTimezone: string;
    sessionTimezone: string | null;
    userTimezone: string | null;
    context: Pick<FilterBoundaryContext, 'startOfWeek' | 'getUiString'>;
}): string[] =>
    charts.flatMap(({ tileUuid, metricQuery, fields }) =>
        getDashboardBoundaryErrors(
            savedFilters,
            filters,
            tileUuid,
            fields.map(getItemId),
            (target) => ({
                ...context,
                ...getFilterBoundaryFieldContext(
                    fields.find((field) => getItemId(field) === target.fieldId),
                ),
                timezone: resolveQueryTimezone({
                    sessionTimezone,
                    metricQuery,
                    projectTimezone,
                    userTimezone,
                }),
            }),
        ),
    );
