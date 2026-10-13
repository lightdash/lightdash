import { MissingConfigError, type WarehouseClient } from '@lightdash/common';
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

// External-source files share the pre-aggregates bucket, so they share its
// warm instance with managed pre-aggregates too
export const PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY =
    'pre-aggregate-query-instance';

export const COMPOSE_ENGINE_MISSING_EXTERNAL_SOURCES_STORAGE_MESSAGE =
    'External sources need the pre-aggregates S3 configuration (PRE_AGGREGATE_RESULTS_S3_*) to read their ingested files.';

export const COMPOSE_ENGINE_MISSING_CA_BUNDLE_MESSAGE =
    'External sources read object storage over HTTPS but found no CA certificate bundle to verify it with. Install ca-certificates in the image, or set SSL_CERT_FILE to a PEM bundle.';

const SCOPED_SESSION_RESOURCE_LIMITS: DuckdbResourceLimits = {
    memoryLimit: '512MB',
    threads: 2,
};

/**
 * A session over the pre-aggregates bucket, where external-source files are
 * ingested. A scope limits the DuckDB secret to that one URI; null is the
 * shared warm instance.
 */
export type ComposeEngineSession = {
    storage: 'externalSources';
    scope: string | null;
};

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
 * The in-process DuckDB engine that executes external SQL and external-source
 * queries over files ingested into the pre-aggregates bucket.
 */
export class ComposeEngineClient {
    private readonly lightdashConfig: LightdashConfig;

    private readonly sharedResourceLimits: DuckdbResourceLimits | null;

    private readonly createDuckdbWarehouseClient: CreateComposeEngineWarehouseClient;

    private readonly resolveCaCertFile: () => string | null;

    private sharedWarehouseClient: WarehouseClient | null = null;

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

    private getSessionConfig(): DuckdbS3SessionConfig {
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

    /**
     * A warehouse client for the given session. A session without a scope is
     * the shared warm instance; a scoped one is an isolated, resource-limited
     * session whose S3 secret only reaches that URI, and it is never cached.
     */
    createExecutionWarehouseClient(
        session: ComposeEngineSession,
    ): WarehouseClient {
        const s3Config = this.getSessionConfig();

        if (session.scope !== null) {
            return this.createDuckdbWarehouseClient({
                s3Config: { ...s3Config, scope: [session.scope] },
                resourceLimits:
                    this.sharedResourceLimits ?? SCOPED_SESSION_RESOURCE_LIMITS,
                organizationConcurrencyLimit:
                    this.lightdashConfig.externalSources
                        .maxConcurrentDuckdbQueriesPerOrganization,
            });
        }

        if (this.sharedWarehouseClient) {
            return this.sharedWarehouseClient;
        }
        this.sharedWarehouseClient = this.createDuckdbWarehouseClient({
            s3Config,
            sharedResourceLimits: this.sharedResourceLimits ?? undefined,
            instanceCacheKey: PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY,
        });
        Logger.info(
            'Compose engine warehouse client created and cached for externalSources',
        );
        return this.sharedWarehouseClient;
    }
}
