import {
    TooManyRequestsError,
    UnexpectedServerError,
    type ExternalConnectionApiSource,
    type LiveSourceErrorCode,
    type QueryExecutionContext,
} from '@lightdash/common';
import type { LiveQueryOutcome } from './query/outcome';
import type {
    LiveHttpRequest,
    LiveHttpResponse,
    LiveIntegration,
    LiveRuntime,
} from './types';

/** Sends a request with the connection's credentials attached, so integrations never hold them. */
export type LiveTransport = (
    request: LiveHttpRequest,
) => Promise<LiveHttpResponse>;

const isOk = (status: number) => status >= 200 && status < 300;

/** `Retry-After` as seconds from now: a number of seconds, or an HTTP date. */
export const parseRetryAfterSeconds = (
    value: string | undefined,
    now: Date,
): number | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const date = Date.parse(trimmed);
    return Number.isNaN(date)
        ? null
        : Math.max(0, Math.ceil((date - now.getTime()) / 1_000));
};

/**
 * Whether a response says the integration is limiting calls, and until when.
 * The integration's `toError` knows its vendor's signals (Meta's throttle
 * codes, Salesforce's REQUEST_LIMIT_EXCEEDED, Google's RESOURCE_EXHAUSTED);
 * a 429 always counts. Null for anything else, server errors included.
 */
export const readLiveRateLimit = (
    integration: LiveIntegration,
    settings: ExternalConnectionApiSource,
    response: LiveHttpResponse,
    now: Date,
): { resumesAt: Date | null } | null => {
    if (isOk(response.status)) return null;
    const error = integration.toError(response, settings);
    const isRateLimit =
        error instanceof TooManyRequestsError || response.status === 429;
    if (!isRateLimit) return null;
    const declared: unknown =
        error instanceof TooManyRequestsError
            ? error.data?.retryAfterSeconds
            : undefined;
    const seconds =
        typeof declared === 'number' && Number.isFinite(declared)
            ? declared
            : parseRetryAfterSeconds(response.headers['retry-after'], now);
    return {
        resumesAt:
            seconds === null ? null : new Date(now.getTime() + seconds * 1_000),
    };
};

/** The calls an integration's `run` and scan make over one connection's transport. */
export const createLiveRuntime = (
    integration: LiveIntegration,
    settings: ExternalConnectionApiSource,
    transport: LiveTransport,
): LiveRuntime => {
    const send = async (request: LiveHttpRequest) => {
        const response = await transport(request);
        if (!isOk(response.status)) {
            throw integration.toError(response, settings);
        }
        return response;
    };
    return {
        send,
        fetch: async (request, schema) => {
            const response = await send(request);
            const parsed = schema.safeParse(response.body);
            if (!parsed.success) {
                throw new UnexpectedServerError(
                    `${integration.label} returned a response in an unexpected shape`,
                );
            }
            return parsed.data;
        },
    };
};

/** What one query's calls cost, counted by the transport so failed queries count too. */
export type LiveCallUsage = {
    apiCalls: number;
    responseBytes: number;
    /** Status of the last response, or null when no response arrived. */
    providerStatus: number | null;
};

/** A finished query, as its connection's call log keeps it. */
export type LiveQueryCall = {
    queryUuid: string;
    context: QueryExecutionContext;
    query: string;
    rowLimit: number;
    outcome: LiveQueryOutcome;
    /** Why it failed, by stable code; null when it succeeded. */
    errorCode: LiveSourceErrorCode | null;
    errorMessage: string | null;
    durationMs: number;
    rowCount: number | null;
    columnCount: number | null;
    /** True when the API had rows past the ones read; null when it wasn't called. */
    truncated: boolean | null;
    /** True when a stored result answered the query and the integration wasn't called. */
    cacheHit: boolean;
};

/**
 * Who may reuse a source's results. A source signed in with one shared
 * credential returns the same rows to everyone who can query it, so they
 * share results; a source that queries as each viewer must not.
 */
export type LiveCacheScope =
    | { kind: 'source' }
    | { kind: 'viewer'; userUuid: string };

/** How long a source's results answer the same query, and since when. */
export type LiveCachePolicy = {
    scope: LiveCacheScope;
    ttlSeconds: number;
    /** Results fetched before this are never reused. */
    purgedAt: Date | null;
};

/** One connection's integration, ready for one query, metering what it sends. */
export type MeteredLiveSource = {
    integration: LiveIntegration;
    settings: ExternalConnectionApiSource;
    cache: LiveCachePolicy;
    runtime: LiveRuntime;
    usage(): LiveCallUsage;
    /** Logs the finished query against its connection; never throws. */
    logCall(call: LiveQueryCall): Promise<void>;
};
