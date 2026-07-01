/**
 * A reference to a saved Lightdash chart, run live by UUID via
 * `POST /query/chart` instead of an inline metric query. Produced by the
 * `savedChart(uuid)` factory and accepted by `useLightdash`.
 *
 * Exposes a chainable `.label()` mirroring `QueryBuilder.label()`, so a linked
 * chart supports the same `.label("…")` convention the agent uses on every
 * query (calling `.label()` on a plain object would crash the app).
 */
export type SavedChartQuery = {
    kind: 'savedChart';
    chartUuid: string;
    /** Resolved label text for the query inspector (set via `.label()`). */
    labelText?: string;
    /** Chainable — returns a copy with the given query-inspector label. */
    label: (name: string) => SavedChartQuery;
};

export function savedChart(
    chartUuid: string,
    labelText?: string,
): SavedChartQuery {
    const build = (text?: string): SavedChartQuery => ({
        kind: 'savedChart',
        chartUuid,
        ...(text ? { labelText: text } : {}),
        label: (name: string) => build(name),
    });
    return build(labelText);
}
