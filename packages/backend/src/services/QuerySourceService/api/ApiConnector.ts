import type {
    ApiConnectorType,
    ApiSourcePayload,
    DimensionType,
    QueryExecutionContext,
} from '@lightdash/common';
import type { ApiQueryOutcome } from './apiQueryOutcome';

/** How much query work an API does itself, from 5 (runs SQL) down to 1 (lists records). */
export type ApiLevel = 1 | 2 | 3 | 4 | 5;

/** How hard Lightdash may call the API through one connection, across all servers. */
export type ApiConnectorLimits = {
    concurrentCalls: number;
    callsPerMinute: number;
    callsPerHour: number;
    /** Calls one query may make; lower-level APIs page through many. */
    callsPerQuery: number;
};

export type ApiConnectorDescription = {
    connector: ApiConnectorType;
    label: string;
    level: ApiLevel;
    /** The language `query` payloads are written in. */
    queryLanguage: string;
    /** Most rows one execution can return. */
    maxRows: number;
    /** How long the API lets one query run before failing it. */
    timeoutMs: number;
    limits: ApiConnectorLimits;
};

export type ApiConnectorColumn = {
    name: string;
    type: DimensionType;
};

export type ApiConnectorResult = {
    columns: ApiConnectorColumn[];
    rows: Record<string, unknown>[];
    /** True when the API had more rows than the requested limit. */
    truncated: boolean;
    /** Bytes the API reports reading, or null when it doesn't report them. */
    bytesRead: number | null;
};

export type ApiConnectorRequest = {
    method: 'GET' | 'POST';
    /** Path on the API's origin, e.g. /api/projects/1/query/ */
    path: string;
    body: unknown;
};

export type ApiConnectorResponse = {
    status: number;
    /** Header names in lowercase. */
    headers: Record<string, string>;
    /** Parsed JSON, or the raw text when the body is not JSON. */
    body: unknown;
};

/** Sends a request with the connection's credentials attached, so connectors never hold them. */
export type ApiConnectorTransport = (
    request: ApiConnectorRequest,
) => Promise<ApiConnectorResponse>;

export type ApiConnectorExecuteArgs = {
    payload: ApiSourcePayload;
    limit: number;
};

/** One external API an api query source can call live. */
export interface ApiConnector {
    describe(): ApiConnectorDescription;
    execute(args: ApiConnectorExecuteArgs): Promise<ApiConnectorResult>;
}

/** What one query's calls cost, counted by the transport so failed queries count too. */
export type ApiConnectorUsage = {
    apiCalls: number;
    responseBytes: number;
    /** Status of the last response, or null when no response arrived. */
    providerStatus: number | null;
};

/** A finished query, as its connection's call log keeps it. */
export type ApiConnectorCall = {
    queryUuid: string;
    context: QueryExecutionContext;
    query: string;
    rowLimit: number;
    outcome: ApiQueryOutcome;
    errorMessage: string | null;
    durationMs: number;
    rowCount: number | null;
    columnCount: number | null;
    truncated: boolean | null;
};

/** A connector bound to one connection for one query, metering what it sends. */
export interface MeteredApiConnector extends ApiConnector {
    usage(): ApiConnectorUsage;
    /** Logs the finished query against its connection; never throws. */
    logCall(call: ApiConnectorCall): Promise<void>;
}
