import {
    assertUnreachable,
    getErrorMessage,
    getPreAggregateExploreName,
    ItemsMap,
    MetricQuery,
    MissingConfigError,
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
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import { PRE_AGGREGATE_QUERY_INSTANCE_CACHE_KEY } from '../../../services/AsyncQueryService/ComposeEngineClient';
import { type PreAggregationRoute } from '../../../services/AsyncQueryService/types';
import {
    exploreHasFilteredAttribute,
    getFilteredExplore,
} from '../../../services/UserAttributesService/UserAttributeUtils';
import { traceSpan } from '../../../tracing/tracing';
import { wrapSentryTransaction } from '../../../utils';
import {
    getDuckdbPreAggregateSqlTable,
    getPreAggregateDuckdbLocator,
} from '../../../utils/duckdb/duckdbSqlTables';
import { getDuckdbRuntimeConfig } from '../../../utils/duckdb/getDuckdbRuntimeConfig';
import { QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import { hashPreAggregateCompatibility } from '../PreAggregateMaterializationService/preAggregatePreparation';

type PreAggregationDuckDbClientArgs = {
    lightdashConfig: LightdashConfig;
    preAggregateModel: Pick<PreAggregateModel, 'getServingSnapshot'>;
    preAggregateResultsStorageClient: Pick<
        S3ResultsFileStorageClient,
        'getFileSize'
    >;
    prometheusMetrics?: PrometheusMetrics;
    sharedResourceLimits?: DuckdbResourceLimits;
    createDuckdbWarehouseClient?: (args: {
        s3Config: DuckdbS3SessionConfig;
        sharedResourceLimits?: DuckdbResourceLimits;
        resourceLimits?: DuckdbResourceLimits;
        instanceCacheKey?: string;
        organizationConcurrencyLimit?: number;
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
    useTimezoneAwareDateTrunc?: boolean;
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
        'getServingSnapshot'
    >;

    private readonly preAggregateResultsStorageClient: Pick<
        S3ResultsFileStorageClient,
        'getFileSize'
    >;

    private readonly sharedResourceLimits?: DuckdbResourceLimits;

    private readonly createDuckdbWarehouseClient: (args: {
        s3Config: DuckdbS3SessionConfig;
        sharedResourceLimits?: DuckdbResourceLimits;
        resourceLimits?: DuckdbResourceLimits;
        instanceCacheKey?: string;
        organizationConcurrencyLimit?: number;
    }) => WarehouseClient;

    private readonly prometheusMetrics?: PrometheusMetrics;

    private cachedWarehouseClient: WarehouseClient | null = null;

    constructor(args: PreAggregationDuckDbClientArgs) {
        this.lightdashConfig = args.lightdashConfig;
        this.preAggregateModel = args.preAggregateModel;
        this.preAggregateResultsStorageClient =
            args.preAggregateResultsStorageClient;
        this.prometheusMetrics = args.prometheusMetrics;
        this.sharedResourceLimits = args.sharedResourceLimits;
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
                            this.prometheusMetrics?.observeDuckdbQueryProfile,
                    },
                ));
    }

    // Reads managed materializations, so its session is the pre-aggregate
    // bucket's; composed queries run on the OSS compose engine instead
    createPreAggregateWarehouseClient(): WarehouseClient {
        if (!this.cachedWarehouseClient) {
            const duckdbRuntimeConfig = getDuckdbRuntimeConfig(
                this.lightdashConfig.preAggregates.s3,
            );

            if (!duckdbRuntimeConfig) {
                throw new MissingConfigError(
                    'Pre-aggregate DuckDB execution is unavailable: missing pre-aggregate S3 configuration',
                );
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

        const snapshot = await this.preAggregateModel.getServingSnapshot(
            args.projectUuid,
            preAggExploreName,
        );
        const activeMaterialization = snapshot?.activeMaterialization;
        const check = args.preAggregationRoute.compatibilityCheck;
        if (
            check &&
            (check.status === 'unavailable' ||
                !snapshot ||
                snapshot.definition.publicationVersion !==
                    check.publicationVersion ||
                snapshot.definition.compatibilityHash !==
                    check.compatibilityHash ||
                (!check.compatibilityHash &&
                    activeMaterialization?.pinnedContextHash !==
                        check.pinnedContextHash))
        ) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            };
        }
        const routeSnapshot = args.preAggregationRoute.routingSnapshot;
        if (snapshot && routeSnapshot) {
            const routedExplore =
                routeSnapshot.exploreName === snapshot.sourceExplore.name
                    ? snapshot.sourceExplore
                    : snapshot.preAggExplore;
            const accessibleExplore = exploreHasFilteredAttribute(routedExplore)
                ? getFilteredExplore(
                      routedExplore,
                      args.userAccessControls.userAttributes,
                  )
                : routedExplore;
            if (
                routedExplore.name !== routeSnapshot.exploreName ||
                hashPreAggregateCompatibility(accessibleExplore) !==
                    routeSnapshot.fingerprint
            ) {
                return {
                    resolved: false,
                    reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
                };
            }
        }

        if (!activeMaterialization) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            };
        }

        let materializationAvailable = false;
        try {
            const uri = new URL(activeMaterialization.materializationUri);
            if (
                uri.protocol === 's3:' &&
                uri.hostname === preAggregateS3Config.bucket
            ) {
                const key = decodeURIComponent(uri.pathname.slice(1));
                materializationAvailable =
                    (await this.preAggregateResultsStorageClient.getFileSize(
                        key,
                        activeMaterialization.format,
                    )) !== null;
            }
        } catch {
            // A durable registry entry can outlive its object. Missing or
            // unreadable storage follows the ordinary managed-route fallback.
        }
        if (!materializationAvailable) {
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

        const preAggExplore = snapshot?.preAggExplore;
        if (!preAggExplore) {
            return {
                resolved: false,
                reason: PreAggregationDuckDbResolveReason.NO_ACTIVE_MATERIALIZATION,
            };
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

        const queryComposer = new QueryComposer(
            {
                metricQuery: args.metricQuery,
                pivotConfiguration: args.pivotConfiguration,
            },
            {
                explore: patchedPreAggExplore,
                warehouseSqlBuilder,
                intrinsicUserAttributes:
                    args.userAccessControls.intrinsicUserAttributes,
                userAttributes: args.userAccessControls.userAttributes,
                timezone: args.timezone,
                availableParameterDefinitions:
                    args.availableParameterDefinitions,
                parameters: args.parameters,
                dateZoom: args.dateZoom,
                pivotDimensions: undefined,
                // Pre-agg pivots against the source query's persisted fields,
                // not the pre-agg explore's freshly compiled ones.
                pivotItemsMap: args.fieldsMap,
                continueOnError: undefined,
                useTimezoneAwareDateTrunc: args.useTimezoneAwareDateTrunc,
                columnTimezone: undefined,
                applyDateZoomToFilters: undefined,
            },
        );

        const query = traceSpan(
            {
                op: 'function',
                name: 'preagg.compileQuery',
            },
            () =>
                queryComposer.getSql({
                    columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
                }),
        );

        const warehouseClient = this.createPreAggregateWarehouseClient();

        return {
            resolved: true,
            query,
            warehouseClient,
        };
    }
}
