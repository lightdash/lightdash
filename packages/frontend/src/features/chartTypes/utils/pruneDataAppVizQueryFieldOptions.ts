import {
    type DataAppVizFieldOptionValues,
    type MetricQuery,
} from '@lightdash/common';

export const getDataAppVizQueryFieldIds = (
    query: MetricQuery,
): ReadonlySet<string> =>
    new Set([
        ...query.dimensions,
        ...query.metrics,
        ...query.tableCalculations.map(({ name }) => name),
    ]);

export const pruneDataAppVizQueryFieldOptions = (
    values: DataAppVizFieldOptionValues,
    fieldIds: ReadonlySet<string>,
): DataAppVizFieldOptionValues => {
    if (
        Object.values(values).every((byField) =>
            Object.keys(byField).every((id) => fieldIds.has(id)),
        )
    )
        return values;
    return Object.fromEntries(
        Object.entries(values).flatMap(([name, byField]) => {
            const kept = Object.fromEntries(
                Object.entries(byField).filter(([id]) => fieldIds.has(id)),
            );
            return Object.keys(kept).length > 0 ? [[name, kept]] : [];
        }),
    );
};
