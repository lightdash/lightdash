import {
    ApiPreAggregateStatsResults,
    ExploreType,
    getPreAggregateExploreName,
    PreAggregateMissReason,
    preAggregateUtils,
    QueryExecutionContext as QEC,
    UnexpectedServerError,
    type Explore,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type MetricQuery,
    type QueryExecutionContext,
    type WarehouseClient,
} from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import Logger from '../../../logging/logger';
import type {
    PreAggregateStrategy as IPreAggregateStrategy,
    PreAggregateExecutionResolution,
    PreAggregateStatsFilters,
    PreAggregationRoutingDecision,
    ResolveExecutionArgs,
} from '../../../services/AsyncQueryService/PreAggregateStrategy';
import { type PreAggregationRoute } from '../../../services/AsyncQueryService/types';
import { type PreAggregateDailyStatsModel } from '../../models/PreAggregateDailyStatsModel';
import { type PreAggregateModel } from '../../models/PreAggregateModel';
import {
    PreAggregationDuckDbClient,
    PreAggregationDuckDbResolveReason,
} from './PreAggregationDuckDbClient';

type EePreAggregateStrategyArgs = {
    preAggregationDuckDbClient: PreAggregationDuckDbClient;
    preAggregateDailyStatsModel: PreAggregateDailyStatsModel;
    preAggregateModel: Pick<PreAggregateModel, 'getActiveMaterialization'>;
    preAggregateResultsStorageClient: S3ResultsFileStorageClient;
    isEnabled: () => boolean;
};

export class PreAggregateStrategy implements IPreAggregateStrategy {
    private readonly duckDbClient: PreAggregationDuckDbClient;

    private readonly statsModel: PreAggregateDailyStatsModel;

    private readonly preAggregateModel: Pick<
        PreAggregateModel,
        'getActiveMaterialization'
    >;

    private readonly resultsStorageClient: S3ResultsFileStorageClient;

    private readonly isEnabled: () => boolean;

    constructor(args: EePreAggregateStrategyArgs) {
        this.duckDbClient = args.preAggregationDuckDbClient;
        this.statsModel = args.preAggregateDailyStatsModel;
        this.preAggregateModel = args.preAggregateModel;
        this.resultsStorageClient = args.preAggregateResultsStorageClient;
        this.isEnabled = args.isEnabled;
    }

    async getRoutingDecision({
        projectUuid,
        metricQuery,
        explore,
        context,
    }: {
        projectUuid: string;
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
    }): Promise<PreAggregationRoutingDecision> {
        if (!this.isEnabled()) {
            return { target: 'warehouse' };
        }

        if (explore.type === ExploreType.PRE_AGGREGATE) {
            if (!explore.preAggregateSource) {
                throw new UnexpectedServerError(
                    `Pre-aggregate explore "${explore.name}" is missing source metadata`,
                );
            }

            const activeMaterialization =
                await this.preAggregateModel.getActiveMaterialization(
                    projectUuid,
                    explore.name,
                );

            if (!activeMaterialization) {
                throw new UnexpectedServerError(
                    `Pre-aggregate explore "${explore.name}" has no active materialization`,
                );
            }

            return {
                target: 'pre_aggregate',
                preAggregateMetadata: {
                    hit: true,
                    name: explore.preAggregateSource.preAggregateName,
                },
                route: {
                    ...explore.preAggregateSource,
                    mode: 'required',
                },
            };
        }

        if ((explore.preAggregates || []).length === 0) {
            return { target: 'warehouse' };
        }

        const matchResult = preAggregateUtils.findMatch(metricQuery, explore);
        const preAggregateMetadata = {
            hit: matchResult.hit,
            name: matchResult.preAggregateName || undefined,
            reason: matchResult.miss || undefined,
        };

        if (context === QEC.PRE_AGGREGATE_MATERIALIZATION) {
            return { target: 'materialization', preAggregateMetadata };
        }

        if (matchResult.hit && matchResult.preAggregateName) {
            // Check if there's an active materialization before reporting a hit
            const preAggExploreName = getPreAggregateExploreName(
                metricQuery.exploreName,
                matchResult.preAggregateName,
            );
            const activeMaterialization =
                await this.preAggregateModel.getActiveMaterialization(
                    projectUuid,
                    preAggExploreName,
                );

            if (!activeMaterialization) {
                return {
                    target: 'warehouse',
                    preAggregateMetadata: {
                        hit: false,
                        name: matchResult.preAggregateName,
                        reason: {
                            reason: PreAggregateMissReason.NO_ACTIVE_MATERIALIZATION,
                            preAggregateName: matchResult.preAggregateName,
                        },
                    },
                };
            }

            return {
                target: 'pre_aggregate',
                preAggregateMetadata,
                route: {
                    sourceExploreName: metricQuery.exploreName,
                    preAggregateName: matchResult.preAggregateName,
                    mode: 'opportunistic',
                },
            };
        }

        return { target: 'warehouse', preAggregateMetadata };
    }

    async resolveExecution({
        projectUuid,
        queryUuid,
        warehouseQuery,
        preAggregationRoute,
        resolveArgs,
    }: {
        projectUuid: string;
        queryUuid: string;
        warehouseQuery: string;
        preAggregationRoute: PreAggregationRoute;
        resolveArgs: ResolveExecutionArgs;
    }): Promise<PreAggregateExecutionResolution> {
        const canResolve =
            !!resolveArgs.userAccessControls &&
            !!resolveArgs.availableParameterDefinitions;

        if (!canResolve) {
            const reason =
                PreAggregationDuckDbClient.getPreAggregationResolutionErrorMessage(
                    {
                        route: preAggregationRoute,
                        reason: PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
                    },
                );
            return {
                resolved: false,
                reason,
                isFatal: preAggregationRoute.mode === 'required',
            };
        }

        const resolution = await this.duckDbClient.resolve({
            projectUuid,
            queryUuid,
            metricQuery: resolveArgs.metricQuery,
            timezone: resolveArgs.timezone,
            dateZoom: resolveArgs.dateZoom,
            parameters: resolveArgs.parameters,
            preAggregationRoute,
            fieldsMap: resolveArgs.fieldsMap,
            pivotConfiguration: resolveArgs.pivotConfiguration,
            startOfWeek: resolveArgs.startOfWeek,
            userAccessControls: resolveArgs.userAccessControls!,
            availableParameterDefinitions:
                resolveArgs.availableParameterDefinitions!,
        });

        if (resolution.resolved) {
            return { resolved: true, query: resolution.query };
        }

        const reason =
            PreAggregationDuckDbClient.getPreAggregationResolutionErrorMessage({
                route: preAggregationRoute,
                reason: resolution.reason,
            });

        return {
            resolved: false,
            reason,
            isFatal: preAggregationRoute.mode === 'required',
        };
    }

    createExecutionWarehouseClient(): WarehouseClient {
        return this.duckDbClient.createExecutionWarehouseClient();
    }

    recordStats(params: {
        projectUuid: string;
        exploreName: string;
        routingDecision: PreAggregationRoutingDecision;
        chartUuid: string | null;
        dashboardUuid: string | null;
        queryContext: string;
    }): void {
        const { preAggregateMetadata } = params.routingDecision;
        if (!preAggregateMetadata) {
            return;
        }

        void this.statsModel
            .upsert({
                projectUuid: params.projectUuid,
                exploreName: params.exploreName,
                chartUuid: params.chartUuid,
                dashboardUuid: params.dashboardUuid,
                queryContext: params.queryContext,
                hit: preAggregateMetadata.hit,
                missReason: preAggregateMetadata.reason?.reason ?? null,
                preAggregateName: preAggregateMetadata.name ?? null,
            })
            .catch((e) =>
                Logger.error('Failed to upsert pre-aggregate daily stats', e),
            );
    }

    async cleanupStats(retentionDays: number): Promise<number> {
        return this.statsModel.cleanup(retentionDays);
    }

    async getStats(
        projectUuid: string,
        days: number,
        paginateArgs?: KnexPaginateArgs,
        filters?: PreAggregateStatsFilters,
    ): Promise<KnexPaginatedData<ApiPreAggregateStatsResults>> {
        const result = await this.statsModel.getByProject(
            projectUuid,
            days,
            paginateArgs,
            filters,
        );

        return {
            data: {
                stats: result.data.map((row) => ({
                    exploreName: row.exploreName,
                    date: row.date.toISOString(),
                    chartUuid: row.chartUuid,
                    chartName: row.chartName,
                    dashboardUuid: row.dashboardUuid,
                    dashboardName: row.dashboardName,
                    queryContext: row.queryContext,
                    hitCount: row.hitCount,
                    missCount: row.missCount,
                    missReason: row.missReason,
                    preAggregateName: row.preAggregateName,
                    updatedAt: row.updatedAt.toISOString(),
                })),
            },
            pagination: result.pagination,
        };
    }

    getResultsStorageClient(): S3ResultsFileStorageClient {
        return this.resultsStorageClient;
    }
}
