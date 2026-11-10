import {
    assertUnreachable,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type LiveSourceUpstreamErrorCode,
} from '@lightdash/common';

export const API_QUERY_OUTCOMES = [
    'ok',
    'invalid_request',
    'query_error',
    'connection_error',
    'rate_limited',
    'timeout',
    'upstream_error',
    'internal_error',
] as const;

export type ApiQueryOutcome = (typeof API_QUERY_OUTCOMES)[number];

/** Buckets a failed api query by cause, from the errors connectors throw. */
export const getApiQueryOutcome = (error: unknown): ApiQueryOutcome => {
    if (error instanceof ParameterError) return 'invalid_request';
    if (error instanceof WarehouseQueryError) return 'query_error';
    if (error instanceof WarehouseConnectionError) return 'connection_error';
    if (error instanceof TooManyRequestsError) return 'rate_limited';
    if (error instanceof TimeoutError) return 'timeout';
    if (error instanceof UnexpectedServerError) return 'upstream_error';
    return 'internal_error';
};

/** The stable code of a failed api query, from its outcome; null when it succeeded. */
export const getLiveSourceUpstreamErrorCode = (
    outcome: ApiQueryOutcome,
): LiveSourceUpstreamErrorCode | null => {
    switch (outcome) {
        case 'ok':
            return null;
        // Our request failed validation, or the API rejected it
        case 'invalid_request':
        case 'query_error':
            return 'live_source.upstream.invalid_request';
        case 'connection_error':
            return 'live_source.upstream.auth';
        case 'rate_limited':
            return 'live_source.upstream.rate_limited';
        case 'timeout':
            return 'live_source.upstream.timeout';
        case 'upstream_error':
        case 'internal_error':
            return 'live_source.upstream.unknown';
        default:
            return assertUnreachable(outcome, 'Unknown api query outcome');
    }
};

/**
 * Codes that usually mean our compiler built a request the API rejects, or
 * something we don't understand: worth a Sentry issue, unlike auth, rate
 * limits and timeouts, which are the source's state.
 */
export const isLiveSourceErrorReportable = (
    code: LiveSourceUpstreamErrorCode,
) =>
    code === 'live_source.upstream.invalid_request' ||
    code === 'live_source.upstream.unknown';
