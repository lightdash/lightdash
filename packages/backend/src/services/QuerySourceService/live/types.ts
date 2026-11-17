import type {
    ApiConnectorType,
    ApiSourceCapabilities,
    ApiSourceOf,
    DimensionType,
    Explore,
    ExternalConnectionAuthType,
    MetricQuery,
    TimeFrames,
    WarehouseSqlBuilder,
} from '@lightdash/common';
import type { z } from 'zod';
import type {
    LiveCompiledRequest,
    LiveExploreDefinition,
    LivePeriodFormat,
} from './explores/definition';

/**
 * One external API Lightdash queries live: a source's settings, what it may
 * call, its explores, and how a metric query becomes calls and rows. Write
 * one with `defineLiveIntegration` and list it in `registry.ts`.
 */
export type LiveIntegration<
    C extends ApiConnectorType = ApiConnectorType,
    Request = unknown,
> = {
    connector: C;
    label: string;
    /** The shape stored on the connection. */
    settings: z.ZodType<ApiSourceOf<C>>;
    /** The hosts a source may call; several when the API has regions. */
    origins: readonly [string, ...string[]];
    /** What a source may call on its origin, whatever its stored connection says. */
    access: (settings: ApiSourceOf<C>) => {
        pathPrefixes: string[];
        methods: Array<'GET' | 'POST'>;
        headers?: Record<string, string> | null;
    };
    limits: LiveLimits;
    capabilities: LiveCapabilities;
    /** The first is the wide model: scans and field edits apply to it. */
    explores: readonly [LiveExploreDefinition, ...LiveExploreDefinition[]];
    /** Explore names reserved for models not built yet. */
    plannedModelNames: readonly string[];
    /** Throws a ParameterError naming the setting the admin has to change. */
    validate: (settings: ApiSourceOf<C>) => void;
    /** Throws a ParameterError when the connection signs in the wrong way. */
    checkAuth: (connection: LiveConnectionCheck) => void;
    /**
     * Says what a source reads, for the AI agent. `targetLabel` is the name
     * the connection picker showed, absent on sources connected without one.
     */
    describeTarget: (args: {
        settings: ApiSourceOf<C>;
        origin: string;
        targetLabel: string | null;
    }) => string;
    /**
     * Reads one query, as compile writes it and as an agent may send it raw.
     * Throws a ParameterError saying what to fix; `jsonRequest` covers JSON.
     */
    parseRequest: (query: string) => Request;
    compile: (args: LiveCompileArgs) => LiveCompiledRequest;
    /**
     * Time grains the API returns as compact periods (e.g. GA4's YYYYWW);
     * their columns are turned into the period's first day.
     */
    periodFormats?: Partial<Record<TimeFrames, LivePeriodFormat>>;
    run: (args: LiveRunArgs<C, Request>) => Promise<LiveRunResult>;
    /** Turns a response outside 2xx into an error that says what to change. */
    toError: (response: LiveHttpResponse, settings: ApiSourceOf<C>) => Error;
    /** Reads fields the API reports itself; omitted when every field is built in. */
    scan?: {
        read: (args: {
            settings: ApiSourceOf<C>;
            calls: LiveCalls;
        }) => Promise<LiveScanResult>;
        withScannedFields: (
            definition: LiveExploreDefinition,
            scan: LiveScanResult,
        ) => LiveExploreDefinition;
        /** Scanned fields kept out of the default field list. */
        isInternalField?: (apiName: string) => boolean;
    };
    /** Defaults to DuckDB, which only runs the compiled explore's SQL shape. */
    warehouseSqlBuilder?: WarehouseSqlBuilder;
};

/** How hard Lightdash may call the API through one connection, and how much one query may read. */
export type LiveLimits = {
    concurrentCalls: number;
    callsPerMinute: number;
    callsPerHour: number;
    /** Calls one query may make; APIs that page need several. */
    callsPerQuery: number;
    /** How long the API lets one call run before failing it. */
    timeoutMs: number;
    /** Most rows one query can return; named in the too-many-rows error. */
    maxRows: number;
};

/**
 * What an integration can do with a metric query. Metric additivity is
 * tagged on each metric and joins these when an explore is built.
 */
export type LiveCapabilities = Omit<ApiSourceCapabilities, 'metrics'>;

export type LiveCompileArgs = {
    explore: Explore;
    metricQuery: MetricQuery;
    timezone: string;
    now: Date;
};

export type LiveRunArgs<C extends ApiConnectorType, Request> = {
    settings: ApiSourceOf<C>;
    request: Request;
    /**
     * Rows the query may return, at least 1. It can exceed `limits.maxRows`;
     * `run` caps or refuses it the way its API needs.
     */
    limit: number;
    calls: LiveCalls;
};

export type LiveColumn = {
    name: string;
    type: DimensionType;
};

export type LiveRunResult = {
    columns: LiveColumn[];
    rows: Record<string, unknown>[];
    /** True when the API had rows past the ones read. */
    hasMoreRows: boolean;
    /** Bytes the API reports reading; omit when it doesn't report them. */
    bytesRead?: number;
};

/** The calls `run` makes, with the connection's credentials and limits applied. */
export type LiveCalls = {
    /** Sends one call; a status outside 2xx throws the integration's `toError`. */
    send(request: LiveHttpRequest): Promise<LiveHttpResponse>;
    /**
     * Sends one call and returns its body, checked against `response`. A
     * status outside 2xx throws the integration's `toError`.
     */
    fetch<T>(request: LiveHttpRequest, response: z.ZodType<T>): Promise<T>;
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

export type LiveConnectionCheck = {
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
};

/** What an integration reports about its own fields; absent when not scanned. */
export type LiveScanResult = {
    ga4Metadata?: unknown;
    posthogProperties?: Record<'event' | 'person', unknown>;
    /** Attio's attribute list for the source's object, as it returns it. */
    attioAttributes?: unknown;
};
