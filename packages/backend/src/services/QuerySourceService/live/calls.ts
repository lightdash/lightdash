import {
    UnexpectedServerError,
    type ExternalConnectionApiSource,
    type QueryExecutionContext,
} from '@lightdash/common';
import type { LiveQueryOutcome } from './query/outcome';
import type {
    LiveCalls,
    LiveHttpRequest,
    LiveHttpResponse,
    LiveIntegration,
} from './types';

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

/** Where integrations keep a response's rows, after a top-level array. */
const ROW_KEYS = ['data', 'items', 'rows', 'results', 'elements'] as const;

/**
 * Rows in one response: a top-level array, or the first array under `data`,
 * `items`, `rows`, `results` or `elements`. A successful response without
 * one has none (APIs like GA4 leave `rows` out of an empty report); a
 * response outside 2xx is null.
 */
export const countLiveResponseRows = ({
    status,
    body,
}: Pick<LiveHttpResponse, 'status' | 'body'>): number | null => {
    if (!isOk(status)) return null;
    if (Array.isArray(body)) return body.length;
    if (typeof body !== 'object' || body === null) return 0;
    const record = body as Record<string, unknown>;
    const rows = ROW_KEYS.map((key) => record[key]).find(Array.isArray);
    return rows ? rows.length : 0;
};

/** One HTTP call a query made, as its connection's call log keeps it. */
export type LiveHttpCall = {
    method: string;
    /** Without the query string, which can hold filter values. */
    path: string;
    /** The path with identifiers as placeholders; see `LiveHttpRequest.endpoint`. */
    endpoint: string;
    /** Null when no response arrived. */
    providerStatus: number | null;
    rowCount: number | null;
    responseBytes: number;
    durationMs: number;
    errorMessage: string | null;
};

/** What one query's calls cost, counted by the transport so failed queries count too. */
export type LiveCallUsage = {
    apiCalls: number;
    responseBytes: number;
    /** Status of the last response, or null when no response arrived. */
    providerStatus: number | null;
    /** Every call the query made, in order. */
    httpCalls: LiveHttpCall[];
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
