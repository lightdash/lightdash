import {
    ParameterError,
    UnexpectedServerError,
    type ApiConnectorType,
    type ApiSourceOf,
    type ExternalConnectionAuthType,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { type z } from 'zod';
import {
    type ApiConnectorCapabilities,
    type ApiConnectorColumn,
    type ApiConnectorLimits,
    type ApiConnectorRequest,
    type ApiConnectorResponse,
    type ApiConnectorResult,
} from '../api/ApiConnector';
import {
    type ApiSourceExploreDefinition,
    type CompiledApiSourceQuery,
} from '../api/apiSourceExplore';
import {
    API_SOURCE_RESPONSE_MAX_BYTES,
    assertApiSourceOrigin,
    type ApiSourceCompileArgs,
    type ApiSourceIntegration,
    type ApiSourceScan,
} from '../api/ApiSourceIntegration';

/** How hard Lightdash may call the API, and how much one call may return. */
export type LiveLimits = ApiConnectorLimits & {
    /** How long the API lets one call run before failing it. */
    timeoutMs: number;
    /** Most rows one query can return. */
    maxRows: number;
};

/** The calls `run` makes, with the connection's credentials and limits applied. */
export type LiveCalls = {
    /** Sends one call; a status outside 2xx throws the integration's `toError`. */
    send(request: ApiConnectorRequest): Promise<ApiConnectorResponse>;
    /**
     * Sends one call and returns its body, checked against `response`. A
     * status outside 2xx throws the integration's `toError`.
     */
    fetch<T>(request: ApiConnectorRequest, response: z.ZodType<T>): Promise<T>;
};

export type LiveRunArgs<C extends ApiConnectorType, Request> = {
    settings: ApiSourceOf<C>;
    request: Request;
    /** Rows the query may return, from 1 to `limits.maxRows`. */
    limit: number;
    calls: LiveCalls;
};

export type LiveRunResult = {
    columns: ApiConnectorColumn[];
    rows: Record<string, unknown>[];
    /** True when the API had rows past the ones read. */
    hasMoreRows: boolean;
    /** Bytes the API reports reading; omit when it doesn't report them. */
    bytesRead?: number;
};

export type LiveConnectionCheck = {
    type: ExternalConnectionAuthType;
    origin: string;
    oauthTokenUrl?: string | null;
};

/**
 * One external API Lightdash queries live. Write one of these per
 * integration and list it in `apiSourceIntegrations.ts`.
 */
export type LiveIntegration<C extends ApiConnectorType, Request> = {
    connector: C;
    label: string;
    /** The shape stored on the connection. */
    settings: z.ZodType<ApiSourceOf<C>>;
    /** The hosts a source may call; several when the API has regions. */
    origins: readonly [string, ...string[]];
    /** What a source may call on `origin`, whatever its stored connection says. */
    access: (settings: ApiSourceOf<C>) => {
        pathPrefixes: string[];
        methods: Array<'GET' | 'POST'>;
        headers?: Record<string, string> | null;
    };
    limits: LiveLimits;
    capabilities: ApiConnectorCapabilities;
    /** The first is the wide model: scans and field edits apply to it. */
    explores: readonly [
        ApiSourceExploreDefinition,
        ...ApiSourceExploreDefinition[],
    ];
    /** Explore names reserved for models not built yet. */
    plannedModelNames: readonly string[];
    /** Throws a ParameterError naming the setting the admin has to change. */
    validate: (settings: ApiSourceOf<C>) => void;
    /** Throws a ParameterError when the connection signs in the wrong way. */
    checkAuth: (connection: LiveConnectionCheck) => void;
    /** Says what a source reads, for the AI agent. */
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
    compile: (args: ApiSourceCompileArgs) => CompiledApiSourceQuery;
    run: (args: LiveRunArgs<C, Request>) => Promise<LiveRunResult>;
    /** Turns a response outside 2xx into an error that says what to change. */
    toError: (
        response: ApiConnectorResponse,
        settings: ApiSourceOf<C>,
    ) => Error;
    /** Reads fields the API reports itself; omitted when every field is built in. */
    scan?: {
        read: (args: {
            settings: ApiSourceOf<C>;
            calls: LiveCalls;
        }) => Promise<ApiSourceScan>;
        withScannedFields: (
            definition: ApiSourceExploreDefinition,
            scan: ApiSourceScan,
        ) => ApiSourceExploreDefinition;
        /** Scanned fields kept out of the default field list. */
        isInternalField?: (apiName: string) => boolean;
    };
    /** Defaults to DuckDB, which only runs the compiled explore's SQL shape. */
    warehouseSqlBuilder?: WarehouseSqlBuilder;
};

/**
 * Reads a JSON request checked by `schema`. `name` names it in errors, as
 * in "The GA4 report request must be a JSON object".
 */
export const jsonRequest =
    <Request>(name: string, schema: z.ZodType<Request>) =>
    (query: string): Request => {
        let json: unknown;
        try {
            json = JSON.parse(query);
        } catch {
            throw new ParameterError(
                `The ${name} request must be a JSON object`,
            );
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
            const [issue] = parsed.error.issues;
            throw new ParameterError(
                issue.path.length === 0 && issue.code === 'custom'
                    ? issue.message
                    : `Invalid ${name} request at ${
                          issue.path.join('.') || 'the top level'
                      }: ${issue.message}`,
            );
        }
        return parsed.data;
    };

const isOk = (status: number) => status >= 200 && status < 300;

/** Builds the integration the rest of the backend reads. */
export const defineLiveIntegration = <C extends ApiConnectorType, Request>(
    live: LiveIntegration<C, Request>,
): ApiSourceIntegration<C> => {
    const { label, limits, scan } = live;
    return {
        connector: live.connector,
        settingsSchema: live.settings,
        baseLayer: {
            baseVersion: 1,
            capabilities: live.capabilities,
            definitions: live.explores,
            plannedModelNames: live.plannedModelNames,
        },
        getAccessRules: (settings) => {
            const access = live.access(settings);
            return {
                allowedPathPrefixes: access.pathPrefixes,
                allowedMethods: access.methods,
                allowedContentTypes: ['application/json'],
                timeoutMs: limits.timeoutMs,
                responseMaxBytes: API_SOURCE_RESPONSE_MAX_BYTES,
                ...(access.headers !== undefined
                    ? { customHeaders: access.headers }
                    : {}),
            };
        },
        validateConnection: ({ apiSource, type, origin, oauthTokenUrl }) => {
            live.validate(apiSource);
            assertApiSourceOrigin(label, origin, live.origins);
            live.checkAuth({ type, origin, oauthTokenUrl });
        },
        describeTarget: ({ apiSource, origin, targetLabel }) =>
            live.describeTarget({ settings: apiSource, origin, targetLabel }),
        compile: live.compile,
        ...(live.warehouseSqlBuilder
            ? { warehouseSqlBuilder: live.warehouseSqlBuilder }
            : {}),
        ...(scan
            ? {
                  withScannedFields: scan.withScannedFields,
                  isInternalField: scan.isInternalField,
              }
            : {}),
        createConnector: (settings, transport) => {
            const send = async (request: ApiConnectorRequest) => {
                const response = await transport(request);
                if (!isOk(response.status)) {
                    throw live.toError(response, settings);
                }
                return response;
            };
            const calls: LiveCalls = {
                send,
                fetch: async (request, schema) => {
                    const response = await send(request);
                    const parsed = schema.safeParse(response.body);
                    if (!parsed.success) {
                        throw new UnexpectedServerError(
                            `${label} returned a response in an unexpected shape`,
                        );
                    }
                    return parsed.data;
                },
            };
            return {
                connector: {
                    describe: () => ({
                        connector: live.connector,
                        label,
                        maxRows: limits.maxRows,
                        timeoutMs: limits.timeoutMs,
                        limits: {
                            concurrentCalls: limits.concurrentCalls,
                            callsPerMinute: limits.callsPerMinute,
                            callsPerHour: limits.callsPerHour,
                            callsPerQuery: limits.callsPerQuery,
                        },
                        capabilities: live.capabilities,
                    }),
                    execute: async ({
                        payload,
                        limit,
                    }): Promise<ApiConnectorResult> => {
                        if (
                            !Number.isInteger(limit) ||
                            limit < 1 ||
                            limit > limits.maxRows
                        ) {
                            throw new ParameterError(
                                `limit must be between 1 and ${limits.maxRows} rows`,
                            );
                        }
                        const request = live.parseRequest(payload.query);
                        const result = await live.run({
                            settings,
                            request,
                            limit,
                            calls,
                        });
                        return { bytesRead: null, ...result };
                    },
                },
                ...(scan ? { scan: () => scan.read({ settings, calls }) } : {}),
            };
        },
    };
};
