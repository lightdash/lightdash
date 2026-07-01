/**
 * A reference to a saved Lightdash chart, run live by UUID via
 * `POST /query/chart` instead of an inline metric query. Produced by the
 * `savedChart(uuid)` factory and accepted by `useLightdash`.
 */
export type SavedChartQuery = {
    kind: 'savedChart';
    chartUuid: string;
    /** Human-readable label for the query inspector (not sent to the API). */
    label?: string;
};

export function savedChart(
    chartUuid: string,
    label?: string,
): SavedChartQuery {
    return { kind: 'savedChart', chartUuid, ...(label ? { label } : {}) };
}
