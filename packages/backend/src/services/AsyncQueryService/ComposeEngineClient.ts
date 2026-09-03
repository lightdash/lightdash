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

export const COMPOSE_ENGINE_INSTANCE_CACHE_KEY = 'compose-engine-instance';

export const COMPOSE_ENGINE_MISSING_RESULTS_STORAGE_MESSAGE =
    'The compose engine needs results storage to read referenced query results. Set S3_ENDPOINT, S3_BUCKET and S3_REGION, or the RESULTS_S3_* overrides.';

const SCOPED_SESSION_RESOURCE_LIMITS: DuckdbResourceLimits = {
    memoryLimit: '512MB',
    threads: 2,
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
};

/**
 * The DuckDB engine that executes composed queries (compose SQL, merges and
 * external SQL) over materialized results. Available in every edition: its
 * session is configured from results storage, which every instance that can
 * run an async query already has.
 */
export class ComposeEngineClient {
    private readonly lightdashConfig: LightdashConfig;

    private readonly sharedResourceLimits: DuckdbResourceLimits | null;

    private readonly createDuckdbWarehouseClient: CreateComposeEngineWarehouseClient;

    private sharedWarehouseClient: WarehouseClient | null = null;

    constructor(args: ComposeEngineClientArgs) {
        this.lightdashConfig = args.lightdashConfig;
        // Shares the pre-aggregate memory budget until the engine has its own
        const memoryLimit =
            args.lightdashConfig.preAggregates.duckdbQueryMemoryLimit;
        this.sharedResourceLimits = memoryLimit ? { memoryLimit } : null;
        const { prometheusMetrics } = args;
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

    private getSessionConfig(): DuckdbS3SessionConfig {
        const sessionConfig = getDuckdbRuntimeConfig(
            this.lightdashConfig.results.s3,
        );
        if (!sessionConfig) {
            throw new MissingConfigError(
                COMPOSE_ENGINE_MISSING_RESULTS_STORAGE_MESSAGE,
            );
        }
        return sessionConfig;
    }

    /**
     * A warehouse client on the compose engine. Without a scope this is the
     * shared warm instance; with one it is an isolated, resource-limited
     * session whose S3 secret only reaches that URI, and it is never cached.
     */
    createExecutionWarehouseClient(scope?: string): WarehouseClient {
        const s3Config = this.getSessionConfig();

        if (scope !== undefined) {
            return this.createDuckdbWarehouseClient({
                s3Config: { ...s3Config, scope },
                resourceLimits:
                    this.sharedResourceLimits ?? SCOPED_SESSION_RESOURCE_LIMITS,
                organizationConcurrencyLimit:
                    this.lightdashConfig.externalSources
                        .maxConcurrentDuckdbQueriesPerOrganization,
            });
        }

        if (!this.sharedWarehouseClient) {
            this.sharedWarehouseClient = this.createDuckdbWarehouseClient({
                s3Config,
                sharedResourceLimits: this.sharedResourceLimits ?? undefined,
                instanceCacheKey: COMPOSE_ENGINE_INSTANCE_CACHE_KEY,
            });
            Logger.info('Compose engine warehouse client created and cached');
        }
        return this.sharedWarehouseClient;
    }
}
