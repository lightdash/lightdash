import {
    assertUnreachable,
    getLiveSourceErrorOrigin,
    isLiveSourceErrorCode,
    LightdashError,
    ParameterError,
    TimeoutError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type LiveSourceErrorCode,
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
    // Lightdash declined the query, e.g. past the rows one query can read
    'refused',
    // Our own concurrency or call-rate limit for the source
    'limited',
] as const;

export type LiveQueryOutcome = (typeof LIVE_QUERY_OUTCOMES)[number];

/** The code a live data source error carries in its data, when it names one. */
const readLiveSourceErrorCode = (
    error: unknown,
): LiveSourceErrorCode | null => {
    if (!(error instanceof LightdashError)) return null;
    const code: unknown = error.data?.liveSourceErrorCode;
    return isLiveSourceErrorCode(code) ? code : null;
};

/** The failure buckets an error falls in by its class alone. */
type UncodedOutcome = Exclude<LiveQueryOutcome, 'ok' | 'refused' | 'limited'>;

const getUncodedOutcome = (error: unknown): UncodedOutcome => {
    if (error instanceof ParameterError) return 'invalid_request';
    if (error instanceof WarehouseQueryError) return 'query_error';
    if (error instanceof WarehouseConnectionError) return 'connection_error';
    if (error instanceof TooManyRequestsError) return 'rate_limited';
    if (error instanceof TimeoutError) return 'timeout';
    if (error instanceof UnexpectedServerError) return 'upstream_error';
    return 'internal_error';
};

/** Buckets a failed api query by cause, from the errors connectors throw. */
export const getLiveQueryOutcome = (error: unknown): LiveQueryOutcome => {
    const code = readLiveSourceErrorCode(error);
    if (code && getLiveSourceErrorOrigin(code) === 'refused') return 'refused';
    if (code === 'live_source.internal.limit') return 'limited';
    return getUncodedOutcome(error);
};

/** The stable code of an error with none of its own, from its outcome. */
const getUncodedErrorCode = (
    outcome: UncodedOutcome,
): LiveSourceInternalErrorCode | LiveSourceUpstreamErrorCode => {
    switch (outcome) {
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

/**
 * The stable code of a failed api query: the one its error carries, such as
 * a refusal, or else the one its outcome implies.
 */
export const getLiveSourceErrorCode = (error: unknown): LiveSourceErrorCode => {
    const code = readLiveSourceErrorCode(error);
    return code ?? getUncodedErrorCode(getUncodedOutcome(error));
};

/**
 * Codes worth a Sentry issue: every failure of ours, and the API rejecting a
 * request our compiler built or failing in a way we don't understand.
 * Refusals, our own limits, auth, rate limits and timeouts are expected.
 */
export const isLiveSourceErrorReportable = (code: LiveSourceErrorCode) =>
    (getLiveSourceErrorOrigin(code) === 'internal' &&
        code !== 'live_source.internal.limit') ||
    code === 'live_source.upstream.invalid_request' ||
    code === 'live_source.upstream.unknown';
