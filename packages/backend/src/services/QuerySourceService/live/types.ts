import type {
    ApiConnectorType,
    ApiSourceCapabilities,
    ApiSourceOf,
    DimensionType,
    Explore,
    ExternalConnectionAuthType,
    LiveSourceTestFact,
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
import type {
    LiveIntegrationKind,
    LiveIntegrationSpec,
    LiveRateLimits,
} from './spec/types';

/**
 * One external API Lightdash queries live, in four parts read top to
 * bottom: how a source connects, what it can query, how a query runs, and
 * the vendor's facts. Write one with `defineLiveIntegration` and list it in
 * `registry.ts`.
 *
 * Integrations hold no state. A function that takes `runtime` may call the
 * API; every other function is pure. The service owns credentials, rate
 * limits, stored catalogs and field edits.
 */
export type LiveIntegration<
    C extends ApiConnectorType = ApiConnectorType,
    Request = unknown,
    Catalog extends LiveCatalog = LiveCatalog,
> = {
    connector: C;
    label: string;
    /**
     * How Integrations 2.0 answers it: `reports` when the API computes
     * totals at a grain, `records` when it returns rows, `sql` when it runs a
     * query language. Nothing reads it yet.
     */
    kind: LiveIntegrationKind;
    connection: LiveConnection<C>;
    model: LiveModel<C, Catalog>;
    query: LiveQuery<C, Request>;
    spec: LiveIntegrationSpec;
};

/** What an admin enters, what a source may call, and how its sign-in is checked. */
export type LiveConnection<C extends ApiConnectorType = ApiConnectorType> = {
    /** The shape stored on the connection. */
    settings: z.ZodType<ApiSourceOf<C>>;
    /** The hosts a source may call; several when the API has regions. */
    origins: readonly [string, ...string[]];
    /**
     * For APIs on a host of each customer's own (a Salesforce My Domain):
     * whether a source may call `origin`. `origins` then only names the
     * shape in errors.
     */
    acceptsOrigin?: (origin: string) => boolean;
    /** What a source may call on its origin, whatever its stored connection says. */
    access: (settings: ApiSourceOf<C>) => LiveAccess;
    /** Throws a ParameterError when the connection signs in the wrong way. */
    checkAuth: (connection: LiveConnectionCheck) => void;
    /** Throws a ParameterError naming the setting the admin has to change. */
    validate?: (settings: ApiSourceOf<C>) => void;
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
     * Reads the setup dialog's test response into what an admin checks: the
     * account it reached and a few counts. Null when the body is not the
     * test's shape; omitted, a 2xx reads as plain "Connected to <label>".
     */
    summarizeTest?: (
        body: unknown,
        settings: ApiSourceOf<C>,
    ) => LiveTestSummary | null;
    /**
     * The one request the setup test sends, written from the source's
     * settings. With it, an admin's test sends this request whatever the
     * dialog asked for, and answers with the check alone, without the API's
     * body or headers. For APIs whose token reads more than the source may.
     * Omitted, the test sends the dialog's request and returns the answer.
     */
    testRequest?: (settings: ApiSourceOf<C>) => LiveHttpRequest;
};

/** The explores a source offers. */
export type LiveModel<
    C extends ApiConnectorType = ApiConnectorType,
    Catalog extends LiveCatalog = LiveCatalog,
> = {
    /** The first is the wide model; discovered fields and field edits apply to it and to `discovery.models`. */
    explores: readonly [LiveExploreDefinition, ...LiveExploreDefinition[]];
    /** Explore names reserved for models not built yet. */
    plannedNames?: readonly string[];
    /** Reads fields the API reports itself; omitted when every field is built in. */
    discovery?: LiveDiscovery<C, Catalog>;
};

export type LiveDiscovery<
    C extends ApiConnectorType = ApiConnectorType,
    Catalog extends LiveCatalog = LiveCatalog,
> = {
    /** Reads what the API has now; the service runs it when a source is created or refreshed. */
    discover: (args: {
        settings: ApiSourceOf<C>;
        runtime: LiveRuntime;
    }) => Promise<Catalog>;
    /**
     * Names of the explores besides the first that discovered fields are
     * added to, each curated on its own. Omitted, only the first is.
     */
    models?: readonly string[];
    /** One explore with the fields `discover` found; the service applies it to the first explore and `models`. */
    withFields: (
        definition: LiveExploreDefinition,
        catalog: Catalog,
    ) => LiveExploreDefinition;
    /** Discovered fields kept out of the default field list. */
    isInternalField?: (apiName: string) => boolean;
    /**
     * A new source starts with every discovered field in use, for
     * integrations whose explore is only what discovery finds.
     */
    inUseByDefault?: true;
};

/** How a metric query becomes calls and rows. */
export type LiveQuery<
    C extends ApiConnectorType = ApiConnectorType,
    Request = unknown,
> = {
    /**
     * The request compile writes and an agent may send raw: a zod schema for
     * a JSON body, or a parser for a query language. A parser throws a
     * ParameterError saying what to fix.
     */
    request: z.ZodType<Request> | ((query: string) => Request);
    compile: (args: LiveCompileArgs) => LiveCompiledRequest;
    run: (args: LiveRunArgs<C, Request>) => Promise<LiveRunResult>;
    /** Turns a response outside 2xx into an error that says what to change. */
    toError: (response: LiveHttpResponse, settings: ApiSourceOf<C>) => Error;
    capabilities: LiveCapabilities;
    limits: LiveLimits;
    /** A source's own limits, when its settings set them; omitted, every source gets `limits`. */
    limitsFor?: (settings: ApiSourceOf<C>) => LiveLimits;
    /**
     * Time grains the API returns as compact periods (e.g. GA4's YYYYWW);
     * their columns are turned into the period's first day.
     */
    periodFormats?: Partial<Record<TimeFrames, LivePeriodFormat>>;
    /** Defaults to DuckDB, which only runs the compiled explore's SQL shape. */
    warehouseSqlBuilder?: WarehouseSqlBuilder;
};

/**
 * How much one query may do, then how fast a source may call the API. The
 * query fields are ours; the rate limits are the vendor's, and an admin can
 * lower them per source.
 */
export type LiveLimits = LiveRateLimits & {
    /** How long the API lets one call run before failing it. */
    timeoutMs: number;
    /** Most rows one query can return; named in the too-many-rows error. */
    maxRows: number;
    /** Rows one call returns when the API pages; omitted when one call answers the query. */
    pageSize?: number;
    /** Calls one query may make. Omitted, the pages `maxRows` takes at `pageSize`, or 1. */
    callsPerQuery?: number;
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
    runtime: LiveRuntime;
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

/**
 * The only way an integration reaches its API. The service attaches the
 * connection's credentials and applies its rate limits; integrations never
 * see either.
 */
export type LiveRuntime = {
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

export type LiveTestSummary = {
    summary: string;
    facts: LiveSourceTestFact[];
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

/**
 * What `discover` read, as plain JSON. Each integration gives it its own
 * type; the service only passes it back to `describe`.
 */
export type LiveCatalog = Record<string, unknown>;

/**
 * One request a source may send. `path` matches as a segment-aware prefix;
 * exact and templated paths come with stored catalogs. Only reads exist.
 */
export type LiveAccessRule = {
    method: 'GET' | 'POST';
    path: string;
    effect: 'read';
    /** The explore model the rule serves; recorded, not checked yet. */
    entry?: string;
};

export type LiveAccess = {
    rules: LiveAccessRule[];
    /** Headers the service sends with every request; null clears stored ones. */
    headers?: Record<string, string> | null;
};
