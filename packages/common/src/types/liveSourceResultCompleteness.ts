/**
 * Whether a live data source query got every row it needed.
 *
 * - `complete`: the API returned every row.
 * - `own_limit`: the API had more rows, but only past the query's own row
 *   limit, in the order the query asked for. The result is what was asked for.
 * - `source_cut`: the API stopped before Lightdash had every row it needed,
 *   e.g. to sort on something the API can't sort by. Totals, sorts and series
 *   can be wrong, so the result must say it is incomplete.
 */
export const LIVE_SOURCE_RESULT_COMPLETENESS = [
    'complete',
    'own_limit',
    'source_cut',
] as const;

export type LiveSourceResultCompleteness =
    (typeof LIVE_SOURCE_RESULT_COMPLETENESS)[number];

export const isLiveSourceResultCompleteness = (
    value: unknown,
): value is LiveSourceResultCompleteness =>
    typeof value === 'string' &&
    (LIVE_SOURCE_RESULT_COMPLETENESS as readonly string[]).includes(value);

/** One line for anyone reading a result the source cut, people and agents alike. */
export const LIVE_SOURCE_SOURCE_CUT_MESSAGE =
    'This result is incomplete: the live data source returned only part of the rows. Narrow the date range, add a filter or remove a dimension.';
