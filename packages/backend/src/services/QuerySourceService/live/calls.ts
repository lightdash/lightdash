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

/** One connection's integration, ready for one query, metering what it sends. */
export type MeteredLiveSource = {
    integration: LiveIntegration;
    settings: ExternalConnectionApiSource;
    calls: LiveCalls;
    usage(): LiveCallUsage;
    /** Logs the finished query against its connection; never throws. */
    logCall(call: LiveQueryCall): Promise<void>;
};
