import {
    assertUnreachable,
    MissingConfigError,
    type WarehouseClient,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    type DuckdbResourceLimits,
    type DuckdbS3SessionConfig,
} from '@lightdash/warehouses';
import { type LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { resolveCaCertFile } from '../../utils/duckdb/resolveCaCertFile';

export const COMPOSE_ENGINE_INSTANCE_CACHE_KEY = 'compose-engine-instance';

// External-source files share the pre-aggregates bucket, so they share its
// warm instance with managed pre-aggregates too
export const PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY =
    'pre-aggregate-query-instance';

export const COMPOSE_ENGINE_MISSING_RESULTS_STORAGE_MESSAGE =
    'The compose engine needs results storage to read referenced query results. Set S3_ENDPOINT, S3_BUCKET and S3_REGION, or the RESULTS_S3_* overrides.';

export const COMPOSE_ENGINE_MISSING_EXTERNAL_SOURCES_STORAGE_MESSAGE =
    'External sources need the pre-aggregates S3 configuration (PRE_AGGREGATE_RESULTS_S3_*) to read their ingested files.';

export const COMPOSE_ENGINE_MISSING_CA_BUNDLE_MESSAGE =
    'The compose engine reads object storage over HTTPS but found no CA certificate bundle to verify it with. Install ca-certificates in the image, or set SSL_CERT_FILE to a PEM bundle.';

const SCOPED_SESSION_RESOURCE_LIMITS: DuckdbResourceLimits = {
    memoryLimit: '512MB',
    threads: 2,
};

/**
 * Which S3 config owns the files a session reads. The DuckDB secret pins one
 * endpoint and region, so a session must be built from the config of the
 * bucket it reads: results storage for result files, the pre-aggregates
 * bucket for external-source files.
 */
export type ComposeEngineSession =
    | { storage: 'results' }
    | { storage: 'externalSources'; scope: string | null };

type ComposeEngineStorage = ComposeEngineSession['storage'];

type CreateComposeEngineWarehouseClientArgs = {
    s3Config: DuckdbS3SessionConfig;
    sharedResourceLimits?: DuckdbResourceLimits;
    resourceLimits?: DuckdbResourceLimits;
    instanceCacheKey?: string;
    organizationConcurrencyLimit?: number;
};

type CreateComposeEngineWarehouseClient = (
    args: CreateComposeEngineWarehouseClientArgs,
) => WarehouseClient;

type ComposeEngineClientArgs = {
    lightdashConfig: LightdashConfig;
    prometheusMetrics?: PrometheusMetrics;
    createDuckdbWarehouseClient?: CreateComposeEngineWarehouseClient;
    resolveCaCertFile?: () => string | null;
};

/**
 * The DuckDB engine that executes composed queries (compose SQL, merges and
 * external SQL) over materialized results. Available in every edition: the
 * results session only needs results storage, which every instance that can
 * run an async query already has.
 */
export class ComposeEngineClient {
    private readonly lightdashConfig: LightdashConfig;

    private readonly sharedResourceLimits: DuckdbResourceLimits | null;

    private readonly createDuckdbWarehouseClient: CreateComposeEngineWarehouseClient;

    private readonly resolveCaCertFile: () => string | null;

    private readonly sharedWarehouseClients = new Map<
        ComposeEngineStorage,
        WarehouseClient
    >();

    constructor(args: ComposeEngineClientArgs) {
        this.lightdashConfig = args.lightdashConfig;
        // Shares the pre-aggregate memory budget until the engine has its own
        const memoryLimit =
            args.lightdashConfig.preAggregates.duckdbQueryMemoryLimit;
        this.sharedResourceLimits = memoryLimit ? { memoryLimit } : null;
        const { prometheusMetrics } = args;
        this.resolveCaCertFile =
            args.resolveCaCertFile ?? (() => resolveCaCertFile());
        this.createDuckdbWarehouseClient =
            args.createDuckdbWarehouseClient ??
            ((warehouseArgs) =>
                DuckdbWarehouseClient.createForPreAggregate(
                    { type: 'duckdb_s3', s3Config: warehouseArgs.s3Config },
                    {
                        sharedResourceLimits:
                            warehouseArgs.sharedResourceLimits,
                        resourceLimits: warehouseArgs.resourceLimits,
                        instanceCacheKey: warehouseArgs.instanceCacheKey,
                        organizationConcurrencyLimit:
                            warehouseArgs.organizationConcurrencyLimit,
                        logger: Logger,
                        enableQueryProfiling: true,
                        onQueryProfile:
                            prometheusMetrics?.observeDuckdbQueryProfile,
                    },
                ));
    }

    /**
     * httpfs must load a CA bundle to speak HTTPS at all, and the runtime
     * image only has one if it was installed. Refuse up front with the fix
     * named rather than let every read fail with an opaque IO error.
     */
    private withCaCertFile(
        sessionConfig: DuckdbS3SessionConfig,
    ): DuckdbS3SessionConfig {
        if (!sessionConfig.useSsl) return sessionConfig;
        const caCertFile = this.resolveCaCertFile();
        if (caCertFile === null) {
            throw new MissingConfigError(
                COMPOSE_ENGINE_MISSING_CA_BUNDLE_MESSAGE,
            );
        }
        return { ...sessionConfig, caCertFile };
    }

    private getSessionConfig(
        storage: ComposeEngineStorage,
    ): DuckdbS3SessionConfig {
        switch (storage) {
            case 'results': {
                const sessionConfig = getDuckdbRuntimeConfig(
                    this.lightdashConfig.results.s3,
                );
                if (!sessionConfig) {
                    throw new MissingConfigError(
                        COMPOSE_ENGINE_MISSING_RESULTS_STORAGE_MESSAGE,
                    );
                }
                return this.withCaCertFile(sessionConfig);
            }
            case 'externalSources': {
                const sessionConfig = getDuckdbRuntimeConfig(
                    this.lightdashConfig.preAggregates.s3,
                );
                if (!sessionConfig) {
                    throw new MissingConfigError(
                        COMPOSE_ENGINE_MISSING_EXTERNAL_SOURCES_STORAGE_MESSAGE,
                    );
                }
                return this.withCaCertFile(sessionConfig);
            }
            default:
                return assertUnreachable(
                    storage,
                    'Unknown compose engine storage',
                );
        }
    }

    private static getInstanceCacheKey(storage: ComposeEngineStorage): string {
        switch (storage) {
            case 'results':
                return COMPOSE_ENGINE_INSTANCE_CACHE_KEY;
            case 'externalSources':
                return PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY;
            default:
                return assertUnreachable(
                    storage,
                    'Unknown compose engine storage',
                );
        }
    }

    /**
     * A warehouse client on the compose engine for the given session. A
     * session without a scope is the shared warm instance of its storage; a
     * scoped one is an isolated, resource-limited session whose S3 secret
     * only reaches that URI, and it is never cached.
     */
    createExecutionWarehouseClient(
        session: ComposeEngineSession,
    ): WarehouseClient {
        const s3Config = this.getSessionConfig(session.storage);

        if (session.storage === 'externalSources' && session.scope !== null) {
            return this.createDuckdbWarehouseClient({
                s3Config: { ...s3Config, scope: session.scope },
                resourceLimits:
                    this.sharedResourceLimits ?? SCOPED_SESSION_RESOURCE_LIMITS,
                organizationConcurrencyLimit:
                    this.lightdashConfig.externalSources
                        .maxConcurrentDuckdbQueriesPerOrganization,
            });
        }

        const cached = this.sharedWarehouseClients.get(session.storage);
        if (cached) {
            return cached;
        }
        const warehouseClient = this.createDuckdbWarehouseClient({
            s3Config,
            sharedResourceLimits: this.sharedResourceLimits ?? undefined,
            instanceCacheKey: ComposeEngineClient.getInstanceCacheKey(
                session.storage,
            ),
        });
        this.sharedWarehouseClients.set(session.storage, warehouseClient);
        Logger.info(
            `Compose engine warehouse client created and cached for ${session.storage}`,
        );
        return warehouseClient;
    }
}
