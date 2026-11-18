import {
    assertUnreachable,
    getLiveSourceErrorOrigin,
    LightdashError,
    LIVE_SOURCE_REFUSAL_CODES,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type LiveSourceErrorCode,
    type LiveSourceInternalErrorCode,
    type LiveSourceRefusalCode,
    type LiveSourceUpstreamErrorCode,
} from '@lightdash/common';

export const LIVE_QUERY_OUTCOMES = [
    'ok',
    'invalid_request',
    'query_error',
    'connection_error',
    'rate_limited',
    'timeout',
    'upstream_error',
    'internal_error',
] as const;

export type LiveQueryOutcome = (typeof LIVE_QUERY_OUTCOMES)[number];

/** Buckets a failed api query by cause, from the errors connectors throw. */
export const getLiveQueryOutcome = (error: unknown): LiveQueryOutcome => {
    if (error instanceof ParameterError) return 'invalid_request';
    if (error instanceof WarehouseQueryError) return 'query_error';
    if (error instanceof WarehouseConnectionError) return 'connection_error';
    if (error instanceof TooManyRequestsError) return 'rate_limited';
    if (error instanceof TimeoutError) return 'timeout';
    if (error instanceof UnexpectedServerError) return 'upstream_error';
    return 'internal_error';
};

/** The stable code of a failed api query, from its outcome; null when it succeeded. */
export const getLiveSourceQueryErrorCode = (
    outcome: LiveQueryOutcome,
): LiveSourceInternalErrorCode | LiveSourceUpstreamErrorCode | null => {
    switch (outcome) {
        case 'ok':
            return null;
        // Our own validation rejected the request before it was sent
        case 'invalid_request':
            return 'live_source.internal.invalid_request';
        case 'internal_error':
            return 'live_source.internal.error';
        // The API rejected the request, or failed
        case 'query_error':
            return 'live_source.upstream.invalid_request';
        case 'connection_error':
            return 'live_source.upstream.auth';
        case 'rate_limited':
            return 'live_source.upstream.rate_limited';
        case 'timeout':
            return 'live_source.upstream.timeout';
        case 'upstream_error':
            return 'live_source.upstream.unknown';
        default:
            return assertUnreachable(outcome, 'Unknown api query outcome');
    }
};

const isRefusalCode = (code: unknown): code is LiveSourceRefusalCode =>
    (LIVE_SOURCE_REFUSAL_CODES as readonly unknown[]).includes(code);

/**
 * The stable code of a failed api query: the refusal its error carries when
 * Lightdash refused it mid-run (too many bytes read), else its outcome's.
 */
export const getLiveSourceErrorCode = (
    error: unknown,
    outcome: LiveQueryOutcome,
): LiveSourceErrorCode | null => {
    const carried =
        error instanceof LightdashError
            ? error.data?.liveSourceErrorCode
            : undefined;
    return isRefusalCode(carried)
        ? carried
        : getLiveSourceQueryErrorCode(outcome);
};

/**
 * Codes worth a Sentry issue: every failure of ours, and the API rejecting a
 * request our compiler built or failing in a way we don't understand. Auth,
 * rate limits and timeouts are the source's state.
 */
export const isLiveSourceErrorReportable = (code: LiveSourceErrorCode) =>
    getLiveSourceErrorOrigin(code) === 'internal' ||
    code === 'live_source.upstream.invalid_request' ||
    code === 'live_source.upstream.unknown';
