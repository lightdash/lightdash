import type {
    ApiConnectorType,
    ApiSourceCapabilities,
    ApiSourcePayload,
    DimensionType,
    QueryExecutionContext,
} from '@lightdash/common';
import type { LiveQueryOutcome } from './query/outcome';

/** How hard Lightdash may call the API through one connection, across all servers. */
export type LiveCallLimits = {
    concurrentCalls: number;
    callsPerMinute: number;
    callsPerHour: number;
    /** Calls one query may make; lower-level APIs page through many. */
    callsPerQuery: number;
};

export type LiveConnectorDescription = {
    connector: ApiConnectorType;
    label: string;
    /** Most rows one execution can return. */
    maxRows: number;
    /** How long the API lets one query run before failing it. */
    timeoutMs: number;
    limits: LiveCallLimits;
    capabilities: LiveCapabilities;
};

/**
 * What the connector can do with a metric query, declared once per
 * connector. Metric additivity is tagged on each metric of the semantic
 * layer and joins these when an explore is built.
 */
export type LiveCapabilities = Omit<ApiSourceCapabilities, 'metrics'>;

/** Every feature the shared check gates, refused. */
export const ALL_PUSHDOWN_REFUSED: LiveCapabilities['pushdown'] = {
    tableCalculations: 'refused',
    customDimensions: 'refused',
    customMetrics: 'refused',
    pivots: 'refused',
    periodOverPeriod: 'refused',
    dateZoom: 'refused',
};

export type LiveColumn = {
    name: string;
    type: DimensionType;
};

export type LiveConnectorResult = {
    columns: LiveColumn[];
    rows: Record<string, unknown>[];
    /**
     * True when the API had rows past the ones read. A query sorted on our
     * side is refused then, see assertLiveResultComplete.
     */
    hasMoreRows: boolean;
    /** Bytes the API reports reading, or null when it doesn't report them. */
    bytesRead: number | null;
};

export type LiveHttpRequest = {
    method: 'GET' | 'POST';
    /** Path on the API's origin, e.g. /api/projects/1/query/ */
    path: string;
    query?: Record<string, string>;
    /** A query string sent exactly as given, for APIs whose syntax must stay unencoded. */
    rawQuery?: string;
    body: unknown;
};

export type LiveHttpResponse = {
    status: number;
    /** Header names in lowercase. */
    headers: Record<string, string>;
    /** Parsed JSON, or the raw text when the body is not JSON. */
    body: unknown;
};

/** Sends a request with the connection's credentials attached, so connectors never hold them. */
export type LiveTransport = (
    request: LiveHttpRequest,
) => Promise<LiveHttpResponse>;

export type LiveConnectorExecuteArgs = {
    payload: ApiSourcePayload;
    limit: number;
};

/** One external API an api query source can call live. */
export interface LiveConnector {
    describe(): LiveConnectorDescription;
    execute(args: LiveConnectorExecuteArgs): Promise<LiveConnectorResult>;
}

/** What one query's calls cost, counted by the transport so failed queries count too. */
export type LiveConnectorUsage = {
    apiCalls: number;
    responseBytes: number;
    /** Status of the last response, or null when no response arrived. */
    providerStatus: number | null;
};

/** A finished query, as its connection's call log keeps it. */
export type LiveConnectorCall = {
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
};

/** A connector bound to one connection for one query, metering what it sends. */
export interface MeteredLiveConnector extends LiveConnector {
    usage(): LiveConnectorUsage;
    /** Logs the finished query against its connection; never throws. */
    logCall(call: LiveConnectorCall): Promise<void>;
}
