import {
    assertUnreachable,
    getLiveSourceErrorOrigin,
    LightdashError,
    LIVE_SOURCE_INTERNAL_ERROR_CODES,
    LIVE_SOURCE_REFUSAL_CODES,
    LIVE_SOURCE_UPSTREAM_ERROR_CODES,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type LiveSourceErrorCode,
    type LiveSourceErrorData,
    type LiveSourceInternalErrorCode,
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

const LIVE_SOURCE_ERROR_CODES = new Set<string>([
    ...LIVE_SOURCE_REFUSAL_CODES,
    ...LIVE_SOURCE_INTERNAL_ERROR_CODES,
    ...LIVE_SOURCE_UPSTREAM_ERROR_CODES,
]);

const isLiveSourceErrorCode = (code: unknown): code is LiveSourceErrorCode =>
    typeof code === 'string' && LIVE_SOURCE_ERROR_CODES.has(code);

/**
 * How a live query failed: its outcome, and the code the error was thrown
 * with (a refusal, or our own concurrency limit), else the outcome's code.
 */
export const getLiveQueryFailure = (
    error: unknown,
): { outcome: LiveQueryOutcome; errorCode: LiveSourceErrorCode | null } => {
    const outcome = getLiveQueryOutcome(error);
    const carried =
        error instanceof LightdashError
            ? (error.data as Partial<LiveSourceErrorData> | undefined)
                  ?.liveSourceErrorCode
            : undefined;
    return {
        outcome,
        errorCode: isLiveSourceErrorCode(carried)
            ? carried
            : getLiveSourceQueryErrorCode(outcome),
    };
};

/**
 * Codes worth a Sentry issue: every failure of ours, and the API rejecting a
 * request our compiler built or failing in a way we don't understand. Auth,
 * rate limits, timeouts and our own concurrency limit are the source's state;
 * refusals are the query's.
 */
export const isLiveSourceErrorReportable = (code: LiveSourceErrorCode) =>
    (getLiveSourceErrorOrigin(code) === 'internal' &&
        code !== 'live_source.internal.concurrency_limit') ||
    code === 'live_source.upstream.invalid_request' ||
    code === 'live_source.upstream.unknown';
