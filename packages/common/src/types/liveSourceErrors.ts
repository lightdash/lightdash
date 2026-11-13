/**
 * Stable codes for every way a live data source query can fail. Alerts,
 * analytics and the agent group errors by them, so a published code never
 * changes meaning or name; messages can. Add codes, never rename them.
 */
export const LIVE_SOURCE_REFUSAL_CODES = [
    'live_source.refused.table_calculation',
    'live_source.refused.custom_metric',
    'live_source.refused.custom_dimension',
    'live_source.refused.period_over_period',
    'live_source.refused.pivot',
    'live_source.refused.date_zoom',
    'live_source.refused.unknown_field',
    'live_source.refused.filter_operator',
    'live_source.refused.metric_filter',
    'live_source.refused.multiple_values',
    'live_source.refused.or_group',
    'live_source.refused.nested_group',
    'live_source.refused.date_operator',
    'live_source.refused.date_range',
    'live_source.refused.field_combination',
    'live_source.refused.too_many_fields',
    'live_source.refused.timezone',
    'live_source.refused.call_budget',
] as const;

/** Lightdash refused the query before calling the API: the source can't run it. */
export type LiveSourceRefusalCode = (typeof LIVE_SOURCE_REFUSAL_CODES)[number];

export const LIVE_SOURCE_UPSTREAM_ERROR_CODES = [
    'live_source.upstream.auth',
    'live_source.upstream.rate_limited',
    'live_source.upstream.invalid_request',
    'live_source.upstream.timeout',
    'live_source.upstream.unknown',
] as const;

/** The API was called and failed. */
export type LiveSourceUpstreamErrorCode =
    (typeof LIVE_SOURCE_UPSTREAM_ERROR_CODES)[number];

export type LiveSourceErrorCode =
    | LiveSourceRefusalCode
    | LiveSourceUpstreamErrorCode;

/** What a live data source error carries in `LightdashError.data`. */
export type LiveSourceErrorData = {
    liveSourceErrorCode: LiveSourceErrorCode;
    /** Every distinct code when one query was refused for several reasons. */
    liveSourceErrorCodes: LiveSourceErrorCode[];
};
