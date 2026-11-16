/**
 * The single rule for naming a pivoted value column.
 *
 * The pivot SQL aliases each aggregated column, the result transform spreads
 * flat rows onto those names, and previews fabricate rows keyed the same way.
 * All three must agree or lookups silently miss, so they all compose the name
 * here rather than reproducing the string locally.
 */

/**
 * Placeholder for a `null` group-by value in a column name. Without it
 * `[null].join('_')` yields `''`, which collides with the unsuffixed base
 * column. Wrapped in `<>` so it strips cleanly via `friendlyName` if it ever
 * surfaces in a label fallback.
 */
export const NULL_PIVOT_KEY = '<null>';

/**
 * Group-by value of the "Other" pivot column: the one column that adds up
 * every group past the pivot column limit, so stacked totals still cover the
 * whole result. Wrapped in `<>` like `NULL_PIVOT_KEY` so it cannot be mistaken
 * for a real group called "Other".
 */
export const OTHER_PIVOT_KEY = '<other>';

/** Label shown for the `OTHER_PIVOT_KEY` group. */
export const OTHER_PIVOT_LABEL = 'Other';

export const isOtherPivotValue = (value: unknown): boolean =>
    value === OTHER_PIVOT_KEY;

/**
 * True for a series that stands for the "Other" group. It has no single value
 * of the group-by field, so actions that filter by that value (underlying
 * data, drill, dashboard filters) must not be offered on it.
 */
export const isOtherPivotReference = (
    pivotReference: { pivotValues?: { value: unknown }[] } | undefined,
): boolean =>
    (pivotReference?.pivotValues ?? []).some((pivotValue) =>
        isOtherPivotValue(pivotValue.value),
    );

/**
 * Name of a value column before the group-by suffix — also the alias the pivot
 * query gives the aggregated column, so the transform can read it back.
 */
export const getPivotValueColumnBaseName = (
    reference: string,
    aggregation: string,
): string => `${reference}_${aggregation}`;

/**
 * Name of a pivoted value column: the base name suffixed with the group-by
 * values of its pivot column, in group-by order.
 */
export const getPivotValueColumnName = (
    reference: string,
    aggregation: string,
    pivotValues: readonly unknown[],
): string => {
    const baseName = getPivotValueColumnBaseName(reference, aggregation);
    const valueSuffix = pivotValues
        .map((value) =>
            value === null || value === undefined ? NULL_PIVOT_KEY : value,
        )
        .join('_');
    // Truthy check, not a length check: it keeps a single empty-string group-by
    // value on the unsuffixed base column, as it has always been named.
    return valueSuffix ? `${baseName}_${valueSuffix}` : baseName;
};
