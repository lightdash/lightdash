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
