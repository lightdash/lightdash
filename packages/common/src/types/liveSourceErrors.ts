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
    /** The query has more rows than one query can read. */
    'live_source.refused.row_limit',
    /** The query needs more API calls than one query may make. */
    'live_source.refused.call_limit',
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

export const LIVE_SOURCE_INTERNAL_ERROR_CODES = [
    'live_source.internal.invalid_request',
    'live_source.internal.error',
    /** Our own concurrency or call-rate limit for the live data source. */
    'live_source.internal.limit',
] as const;

/** Lightdash failed: our own validation rejected the request, or something broke. */
export type LiveSourceInternalErrorCode =
    (typeof LIVE_SOURCE_INTERNAL_ERROR_CODES)[number];

export type LiveSourceErrorCode =
    | LiveSourceRefusalCode
    | LiveSourceInternalErrorCode
    | LiveSourceUpstreamErrorCode;

/**
 * Who a failed live data source query is on: Lightdash declined it
 * (`refused`), Lightdash failed (`internal`), or the integration was called
 * and failed (`integration`).
 */
export type LiveSourceErrorOrigin = 'refused' | 'internal' | 'integration';

export const getLiveSourceErrorOrigin = (
    code: LiveSourceErrorCode,
): LiveSourceErrorOrigin => {
    if (code.startsWith('live_source.refused.')) return 'refused';
    if (code.startsWith('live_source.internal.')) return 'internal';
    return 'integration';
};

/** What a live data source error carries in `LightdashError.data`. */
export type LiveSourceErrorData = {
    liveSourceErrorCode: LiveSourceErrorCode;
    /** Every distinct code when one query was refused for several reasons. */
    liveSourceErrorCodes: LiveSourceErrorCode[];
};

const LIVE_SOURCE_ERROR_CODES: readonly string[] = [
    ...LIVE_SOURCE_REFUSAL_CODES,
    ...LIVE_SOURCE_UPSTREAM_ERROR_CODES,
    ...LIVE_SOURCE_INTERNAL_ERROR_CODES,
];

export const isLiveSourceErrorCode = (
    value: unknown,
): value is LiveSourceErrorCode =>
    typeof value === 'string' && LIVE_SOURCE_ERROR_CODES.includes(value);

/** The error data for one live data source error code. */
export const toLiveSourceErrorData = (
    code: LiveSourceErrorCode,
): LiveSourceErrorData => ({
    liveSourceErrorCode: code,
    liveSourceErrorCodes: [code],
});
