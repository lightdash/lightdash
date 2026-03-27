import {
    assertUnreachable,
    getErrorMessage,
    getPreAggregateExploreName,
    isExploreError,
    ItemsMap,
    MetricQuery,
    ParameterDefinitions,
    ParametersValuesMap,
    PivotConfiguration,
    SupportedDbtAdapter,
    UserAccessControls,
    WarehouseClient,
    type CreateWarehouseCredentials,
    type DateZoom,
    type RunQueryTags,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    warehouseSqlBuilderFromType,
    type DuckdbResourceLimits,
    type DuckdbS3SessionConfig,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import { type LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { type PreAggregationRoute } from '../../../services/AsyncQueryService/types';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { wrapSentryTransaction } from '../../../utils';
import { PivotQueryBuilder } from '../../../utils/QueryBuilder/PivotQueryBuilder';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import {
    getDuckdbPreAggregateSqlTable,
    getPreAggregateDuckdbLocator,
} from '../PreAggregateMaterializationService/getDuckdbPreAggregateSqlTable';
import { getDuckdbRuntimeConfig } from './getDuckdbRuntimeConfig';

const PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY = 'pre-aggregate-query-instance';

type PreAggregationDuckDbClientArgs = {
    lightdashConfig: LightdashConfig;
    preAggregateModel: Pick<PreAggregateModel, 'getActiveMaterialization'>;
    projectModel: Pick<ProjectModel, 'getExploreFromCache'>;
    prometheusMetrics?: PrometheusMetrics;
    sharedResourceLimits?: DuckdbResourceLimits;
    createDuckdbWarehouseClient?: (args: {
        s3Config: DuckdbS3SessionConfig;
        sharedResourceLimits?: DuckdbResourceLimits;
        instanceCacheKey?: string;
    }) => WarehouseClient;
};

export type ResolvePreAggregationDuckDbArgs = {
    projectUuid: string;
    queryUuid?: string;
    queryTags?: RunQueryTags;
    metricQuery: MetricQuery;
    timezone: string;
    dateZoom: DateZoom | undefined;
    parameters: ParametersValuesMap | undefined;
    preAggregationRoute: PreAggregationRoute;
    fieldsMap: ItemsMap;
    pivotConfiguration: PivotConfiguration | undefined;
    startOfWeek: CreateWarehouseCredentials['startOfWeek'];
    userAccessControls: UserAccessControls;
    availableParameterDefinitions: ParameterDefinitions;
};

export type PreAggregationDuckDbResolution =
    | { resolved: false; reason: PreAggregationDuckDbResolveReason }
    | { resolved: true; query: string; warehouseClient: WarehouseClient };

export enum PreAggregationDuckDbResolveReason {
    PRE_AGGREGATES_DISABLED = 'pre_aggregates_disabled',
    MISSING_PRE_AGGREGATE_S3_CONFIG = 'missing_pre_aggregate_s3_config',
    MISSING_DUCKDB_RUNTIME_CONFIG = 'missing_duckdb_runtime_config',
    NO_ACTIVE_MATERIALIZATION = 'no_active_materialization',
    RESOLVE_ERROR = 'resolve_error',
}

export class PreAggregationDuckDbClient {
    private readonly lightdashConfig: LightdashConfig;

    private readonly preAggregateModel: Pick<
        PreAggregateModel,
        'getActiveMaterialization'
    >;

    private readonly projectModel: Pick<ProjectModel, 'getExploreFromCache'>;

    private readonly sharedResourceLimits?: DuckdbResourceLimits;

    private readonly createDuckdbWarehouseClient: (args: {
        s3Config: DuckdbS3SessionConfig;
        sharedResourceLimits?: DuckdbResourceLimits;
        instanceCacheKey?: string;
    }) => WarehouseClient;

    private readonly prometheusMetrics?: PrometheusMetrics;

    private cachedWarehouseClient: WarehouseClient | null = null;

    constructor(args: PreAggregationDuckDbClientArgs) {
        this.lightdashConfig = args.lightdashConfig;
        this.preAggregateModel = args.preAggregateModel;
        this.projectModel = args.projectModel;
        this.prometheusMetrics = args.prometheusMetrics;
        this.sharedResourceLimits = args.sharedResourceLimits;
        this.createDuckdbWarehouseClient =
            args.createDuckdbWarehouseClient ??
            ((warehouseArgs) =>
                new DuckdbWarehouseClient(
                    { type: 'duckdb_s3', s3Config: warehouseArgs.s3Config },
                    {
                        sharedResourceLimits:
                            warehouseArgs.sharedResourceLimits,
                        instanceCacheKey: warehouseArgs.instanceCacheKey,
                        logger: Logger,
                        onQueryProfile:
                            this.prometheusMetrics?.observeDuckdbQueryProfile,
                    },
                ));
    }

    private getOrCreateWarehouseClient(): WarehouseClient {
        if (!this.cachedWarehouseClient) {
            const duckdbRuntimeConfig = getDuckdbRuntimeConfig(
                this.lightdashConfig.preAggregates.s3,
            );

            if (!duckdbRuntimeConfig) {
                throw new Error('Missing DuckDB runtime config');
            }

            this.cachedWarehouseClient = this.createDuckdbWarehouseClient({
                s3Config: duckdbRuntimeConfig,
                sharedResourceLimits: this.sharedResourceLimits,
                instanceCacheKey: PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY,
            });

            Logger.info('DuckDB warehouse client created and cached for reuse');
        }
        return this.cachedWarehouseClient;
    }

    static getPreAggregationResolutionErrorMessage({
        route,
        reason,
    }: {
        route: PreAggregationRoute;
        reason: PreAggregationDuckDbResolveReason;
    }): string {
        const preAggregateExploreName = getPreAggregateExploreName(
            route.sourceExploreName,
            route.preAggregateName,
        );

        switch (reason) {
            case PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION:
                return `No active materialization found for pre-aggregate explore "${preAggregateExploreName}"`;
            case PreAggregationDuckDbResolveReason.MISSING_PRE_AGGREGATE_S3_CONFIG:
                return 'Pre-aggregate DuckDB routing is unavailable: missing S3 configuration';
            case PreAggregationDuckDbResolveReason.MISSING_DUCKDB_RUNTIME_CONFIG:
                return 'Pre-aggregate DuckDB routing is unavailable: missing DuckDB runtime configuration';
            case PreAggregationDuckDbResolveReason.PRE_AGGREGATES_DISABLED:
                return 'Pre-aggregate DuckDB routing is unavailable: pre-aggregates are disabled';
            case PreAggregationDuckDbResolveReason.RESOLVE_ERROR:
                return `Failed to resolve pre-aggregate explore "${preAggregateExploreName}" in DuckDB`;
            default:
                return assertUnreachable(
                    reason,
                    'Unknown pre-aggregate resolution reason',
                );
        }
    }

    createExecutionWarehouseClient(): WarehouseClient {
        return this.getOrCreateWarehouseClient();
    }

    async resolve(
        args: ResolvePreAggregationDuckDbArgs,
    ): Promise<PreAggregationDuckDbResolution> {
        const startTime = Date.now();
        try {
            const result = await wrapSentryTransaction(
                'PreAggregationDuckDbClient.resolve',
                {},
                () => this._resolve(args),
            );

            const durationMs = Date.now() - startTime;
            this.prometheusMetrics?.trackDuckdbResolution(
                result.resolved,
                result.resolved ? undefined : result.reason,
                durationMs,
            );

            if (!result.resolved) {
                Logger.info(`DuckDB pre-agg skipped: ${result.reason}`);
            }

            return result;
        } catch (error) {
            const durationMs = Date.now() - startTime;
            this.prometheusMetrics?.trackDuckdbResolution(
                false,
                PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
                durationMs,
            );

            Logger.warn(
                `DuckDB pre-agg resolve failed: ${getErrorMessage(error)}. Returning unresolved`,
            );
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
            };
        }
    }

    private async _resolve(
        args: ResolvePreAggregationDuckDbArgs,
    ): Promise<PreAggregationDuckDbResolution> {
        if (!this.lightdashConfig.preAggregates.enabled) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.PRE_AGGREGATES_DISABLED,
            };
        }

        const preAggregateS3Config = this.lightdashConfig.preAggregates.s3;
        if (!preAggregateS3Config) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.MISSING_PRE_AGGREGATE_S3_CONFIG,
            };
        }

        const duckdbRuntimeConfig =
            getDuckdbRuntimeConfig(preAggregateS3Config);
        if (!duckdbRuntimeConfig) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.MISSING_DUCKDB_RUNTIME_CONFIG,
            };
        }

        const preAggExploreName = getPreAggregateExploreName(
            args.preAggregationRoute.sourceExploreName,
            args.preAggregationRoute.preAggregateName,
        );

        const activeMaterialization = await Sentry.startSpan(
            {
                op: 'db.query',
                name: 'preagg.getActiveMaterialization',
                attributes: {
                    'lightdash.projectUuid': args.projectUuid,
                    'lightdash.preAggExploreName': preAggExploreName,
                },
            },
            () =>
                this.preAggregateModel.getActiveMaterialization(
                    args.projectUuid,
                    preAggExploreName,
                ),
        );

        if (!activeMaterialization) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            };
        }

        Logger.info('DuckDB pre-agg materialization selected', {
            queryUuid: args.queryUuid,
            projectUuid: args.projectUuid,
            queryContext: args.queryTags?.query_context,
            chartUuid: args.queryTags?.chart_uuid,
            dashboardUuid: args.queryTags?.dashboard_uuid,
            exploreName: args.queryTags?.explore_name,
            timezone: args.timezone,
            preAggExploreName,
            materializationUuid: activeMaterialization.materializationUuid,
            materializationQueryUuid: activeMaterialization.queryUuid,
            materializationUri: activeMaterialization.materializationUri,
            format: activeMaterialization.format,
            materializedAt: activeMaterialization.materializedAt.toISOString(),
            materializationAgeMs:
                Date.now() - activeMaterialization.materializedAt.getTime(),
            materializationBytes: activeMaterialization.totalBytes,
        });

        const locator = getPreAggregateDuckdbLocator({
            uri: activeMaterialization.materializationUri,
            format: activeMaterialization.format,
        });
        const sqlTable = getDuckdbPreAggregateSqlTable(
            locator,
            activeMaterialization.columns,
        );

        const preAggExplore = await Sentry.startSpan(
            {
                op: 'cache.read',
                name: 'preagg.getExploreFromCache',
                attributes: {
                    'lightdash.projectUuid': args.projectUuid,
                    'lightdash.preAggExploreName': preAggExploreName,
                },
            },
            () =>
                this.projectModel.getExploreFromCache(
                    args.projectUuid,
                    preAggExploreName,
                ),
        );

        if (isExploreError(preAggExplore)) {
            throw new Error(
                `Pre-aggregate explore ${preAggExploreName} is not queryable`,
            );
        }

        const patchedPreAggExplore = {
            ...preAggExplore,
            tables: Object.fromEntries(
                Object.entries(preAggExplore.tables).map(
                    ([tableName, table]) => [
                        tableName,
                        {
                            ...table,
                            sqlTable,
                        },
                    ],
                ),
            ),
        };

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
            args.startOfWeek,
        );

        const fullQuery = await Sentry.startSpan(
            {
                op: 'function',
                name: 'preagg.compileQuery',
            },
            () =>
                ProjectService._compileQuery({
                    metricQuery: args.metricQuery,
                    explore: patchedPreAggExplore,
                    warehouseSqlBuilder,
                    intrinsicUserAttributes:
                        args.userAccessControls.intrinsicUserAttributes,
                    userAttributes: args.userAccessControls.userAttributes,
                    timezone: args.timezone,
                    dateZoom: args.dateZoom,
                    parameters: args.parameters,
                    availableParameterDefinitions:
                        args.availableParameterDefinitions,
                    pivotConfiguration: args.pivotConfiguration,
                }),
        );

        let { query } = fullQuery;
        if (args.pivotConfiguration) {
            const pivotQueryBuilder = new PivotQueryBuilder(
                fullQuery.query,
                args.pivotConfiguration,
                warehouseSqlBuilder,
                args.metricQuery.limit,
                args.fieldsMap,
            );

            query = pivotQueryBuilder.toSql({
                columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
            });
        }

        const warehouseClient = this.getOrCreateWarehouseClient();

        return {
            resolved: true,
            query,
            warehouseClient,
        };
    }
}
