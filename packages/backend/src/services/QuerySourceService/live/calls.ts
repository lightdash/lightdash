import {
    ParameterError,
    UnexpectedServerError,
    type ExternalConnectionApiSource,
    type LiveSourceErrorData,
    type QueryExecutionContext,
} from '@lightdash/common';
import type { LiveQueryOutcome } from './query/outcome';
import type {
    LiveCalls,
    LiveHttpRequest,
    LiveHttpResponse,
    LiveIntegration,
    LiveLimits,
} from './types';

/**
 * Bytes one query may read from an API across all its calls, unless the
 * integration sets less. Each call is capped on its own too; this stops a
 * query paging through hundreds of MB before it is refused for its rows.
 */
export const LIVE_QUERY_MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

const toMegabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Refuses a query once its responses add up to more than it may read. */
export const assertLiveResponseBudget = ({
    label,
    limits,
    responseBytes,
}: {
    label: string;
    limits: Pick<LiveLimits, 'responseBytesPerQuery'>;
    responseBytes: number;
}): void => {
    const maxBytes =
        limits.responseBytesPerQuery ?? LIVE_QUERY_MAX_RESPONSE_BYTES;
    if (responseBytes <= maxBytes) {
        return;
    }
    const data: LiveSourceErrorData = {
        liveSourceErrorCode: 'live_source.refused.response_too_large',
        liveSourceErrorCodes: ['live_source.refused.response_too_large'],
    };
    throw new ParameterError(
        `This ${label} query read more than ${toMegabytes(
            maxBytes,
        )} MB from ${label}, the most one query may read. Add a filter or ask for fewer rows.`,
        data,
    );
};

/** Sends a request with the connection's credentials attached, so integrations never hold them. */
export type LiveTransport = (
    request: LiveHttpRequest,
) => Promise<LiveHttpResponse>;

const isOk = (status: number) => status >= 200 && status < 300;

/** The calls an integration's `run` and scan make over one connection's transport. */
export const createLiveCalls = (
    integration: LiveIntegration,
    settings: ExternalConnectionApiSource,
    transport: LiveTransport,
): LiveCalls => {
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
    calls: LiveCalls;
    usage(): LiveCallUsage;
    /** Logs the finished query against its connection; never throws. */
    logCall(call: LiveQueryCall): Promise<void>;
};
