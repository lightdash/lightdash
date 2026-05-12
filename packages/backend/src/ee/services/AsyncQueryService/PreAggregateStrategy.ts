import {
    ApiPreAggregateStatsResults,
    applyDashboardFiltersForTile,
    assertUnreachable,
    DashboardTileTypes,
    ExploreType,
    findFieldByIdInExplore,
    getItemLabel,
    NotFoundError,
    preAggregateUtils,
    QueryExecutionContext as QEC,
    TileIneligibleReason,
    UnexpectedServerError,
    type Account,
    type DashboardDAO,
    type DashboardFilters,
    type DashboardPreAggregateAudit,
    type DashboardTile,
    type Explore,
    type FieldId,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type MetricQuery,
    type PreAggregateMatchMiss,
    type QueryExecutionContext,
    type TabAuditGroup,
    type TilePreAggregateAuditStatus,
    type WarehouseClient,
} from '@lightdash/common';
import { type S3ResultsFileStorageClient } from '../../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import Logger from '../../../logging/logger';
import { type DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { type SavedChartModel } from '../../../models/SavedChartModel';
import type {
    PreAggregateStrategy as IPreAggregateStrategy,
    PreAggregateExecutionResolution,
    PreAggregateStatsFilters,
    PreAggregationRoutingDecision,
    ResolveExecutionArgs,
} from '../../../services/AsyncQueryService/PreAggregateStrategy';
import { type PreAggregationRoute } from '../../../services/AsyncQueryService/types';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { type PreAggregateDailyStatsModel } from '../../models/PreAggregateDailyStatsModel';
import {
    PreAggregationDuckDbClient,
    PreAggregationDuckDbResolveReason,
} from './PreAggregationDuckDbClient';

type EePreAggregateStrategyArgs = {
    preAggregationDuckDbClient: PreAggregationDuckDbClient;
    preAggregateDailyStatsModel: PreAggregateDailyStatsModel;
    preAggregateResultsStorageClient: S3ResultsFileStorageClient;
    isEnabled: () => boolean;
    dashboardModel: Pick<DashboardModel, 'getByIdOrSlug'>;
    savedChartModel: Pick<SavedChartModel, 'get'>;
    projectService: Pick<ProjectService, 'getExplore'>;
};

export class PreAggregateStrategy implements IPreAggregateStrategy {
    private readonly duckDbClient: PreAggregationDuckDbClient;

    private readonly statsModel: PreAggregateDailyStatsModel;

    private readonly resultsStorageClient: S3ResultsFileStorageClient;

    private readonly isEnabled: () => boolean;

    private readonly dashboardModel: Pick<DashboardModel, 'getByIdOrSlug'>;

    private readonly savedChartModel: Pick<SavedChartModel, 'get'>;

    private readonly projectService: Pick<ProjectService, 'getExplore'>;

    constructor(args: EePreAggregateStrategyArgs) {
        this.duckDbClient = args.preAggregationDuckDbClient;
        this.statsModel = args.preAggregateDailyStatsModel;
        this.resultsStorageClient = args.preAggregateResultsStorageClient;
        this.isEnabled = args.isEnabled;
        this.dashboardModel = args.dashboardModel;
        this.savedChartModel = args.savedChartModel;
        this.projectService = args.projectService;
    }

    getRoutingDecision({
        metricQuery,
        explore,
        context,
    }: {
        metricQuery: MetricQuery;
        explore: Explore;
        context: QueryExecutionContext;
    }): PreAggregationRoutingDecision {
        if (!this.isEnabled()) {
            return { target: 'warehouse' };
        }

        if (explore.type === ExploreType.PRE_AGGREGATE) {
            if (!explore.preAggregateSource) {
                throw new UnexpectedServerError(
                    `Pre-aggregate explore "${explore.name}" is missing source metadata`,
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
            useTimezoneAwareDateTrunc: resolveArgs.useTimezoneAwareDateTrunc,
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

    async auditDashboard({
        account,
        projectUuid,
        dashboard,
        runtimeFilters,
    }: {
        account: Account;
        projectUuid: string;
        dashboard: DashboardDAO;
        runtimeFilters?: DashboardFilters;
    }): Promise<DashboardPreAggregateAudit> {
        const start = Date.now();
        const exploreCache = new Map<string, Promise<Explore>>();
        const getExplore = (exploreName: string): Promise<Explore> => {
            if (!exploreCache.has(exploreName)) {
                exploreCache.set(
                    exploreName,
                    this.projectService.getExplore(
                        account,
                        projectUuid,
                        exploreName,
                    ),
                );
            }
            return exploreCache.get(exploreName)!;
        };

        const dashboardFilters = runtimeFilters ?? dashboard.filters;

        const tileStatuses = await Promise.all(
            dashboard.tiles.map((tile) =>
                this.auditTile({
                    tile,
                    account,
                    projectUuid,
                    savedDashboardFilters: dashboardFilters,
                    getExplore,
                }),
            ),
        );

        const tabs = PreAggregateStrategy.groupTilesByTab(
            dashboard,
            tileStatuses,
        );
        const summary = PreAggregateStrategy.summarize(tileStatuses);

        Logger.info('pre-aggregate audit', {
            projectUuid,
            dashboardUuid: dashboard.uuid,
            tileCount: dashboard.tiles.length,
            hitCount: summary.hitCount,
            missCount: summary.missCount,
            ineligibleCount: summary.ineligibleCount,
            durationMs: Date.now() - start,
        });

        return {
            dashboardUuid: dashboard.uuid,
            dashboardSlug: dashboard.slug,
            dashboardName: dashboard.name,
            tabs,
            summary,
        };
    }

    private async auditTile({
        tile,
        account,
        projectUuid,
        savedDashboardFilters,
        getExplore,
    }: {
        tile: DashboardTile;
        account: Account;
        projectUuid: string;
        savedDashboardFilters: DashboardDAO['filters'];
        getExplore: (exploreName: string) => Promise<Explore>;
    }): Promise<TilePreAggregateAuditStatus> {
        const tileName =
            (tile.properties as { title?: string } | undefined)?.title ??
            tile.uuid;

        const { type: tileType } = tile;
        switch (tileType) {
            case DashboardTileTypes.MARKDOWN:
            case DashboardTileTypes.LOOM:
            case DashboardTileTypes.HEADING:
            case DashboardTileTypes.DATA_APP:
                return {
                    status: 'ineligible',
                    tileUuid: tile.uuid,
                    tileName,
                    tileType: tile.type,
                    ineligibleReason: TileIneligibleReason.NON_CHART_TILE,
                };
            case DashboardTileTypes.SQL_CHART:
                return {
                    status: 'ineligible',
                    tileUuid: tile.uuid,
                    tileName,
                    tileType: tile.type,
                    ineligibleReason: TileIneligibleReason.SQL_CHART,
                };
            case DashboardTileTypes.SAVED_CHART: {
                const savedChartUuid = (
                    tile.properties as { savedChartUuid?: string }
                )?.savedChartUuid;
                if (!savedChartUuid) {
                    return {
                        status: 'ineligible',
                        tileUuid: tile.uuid,
                        tileName,
                        tileType: DashboardTileTypes.SAVED_CHART,
                        ineligibleReason: TileIneligibleReason.ORPHANED_CHART,
                    };
                }

                let savedChart;
                try {
                    savedChart = await this.savedChartModel.get(
                        savedChartUuid,
                        undefined,
                        { projectUuid },
                    );
                } catch (e) {
                    if (e instanceof NotFoundError) {
                        return {
                            status: 'ineligible',
                            tileUuid: tile.uuid,
                            tileName,
                            tileType: DashboardTileTypes.SAVED_CHART,
                            ineligibleReason:
                                TileIneligibleReason.ORPHANED_CHART,
                        };
                    }
                    throw e;
                }

                let explore: Explore;
                try {
                    explore = await getExplore(savedChart.tableName);
                } catch (e) {
                    if (e instanceof NotFoundError) {
                        return {
                            status: 'ineligible',
                            tileUuid: tile.uuid,
                            tileName,
                            tileType: DashboardTileTypes.SAVED_CHART,
                            ineligibleReason:
                                TileIneligibleReason.EXPLORE_RESOLUTION_ERROR,
                        };
                    }
                    throw e;
                }

                const { metricQuery } = applyDashboardFiltersForTile({
                    tileUuid: tile.uuid,
                    metricQuery: savedChart.metricQuery,
                    dashboardFilters: savedDashboardFilters,
                    explore,
                });

                const matchResult = preAggregateUtils.findMatch(
                    metricQuery,
                    explore,
                );

                if (matchResult.hit) {
                    return {
                        status: 'hit',
                        tileUuid: tile.uuid,
                        tileName,
                        tileType: DashboardTileTypes.SAVED_CHART,
                        savedChartUuid,
                        exploreName: explore.name,
                        preAggregateName: matchResult.preAggregateName,
                    };
                }

                return {
                    status: 'miss',
                    tileUuid: tile.uuid,
                    tileName,
                    tileType: DashboardTileTypes.SAVED_CHART,
                    savedChartUuid,
                    exploreName: explore.name,
                    miss: matchResult.miss,
                    missFieldLabel: PreAggregateStrategy.resolveMissFieldLabel(
                        matchResult.miss,
                        explore,
                        metricQuery,
                    ),
                };
            }
            default:
                return assertUnreachable(
                    tileType,
                    `Unknown tile type: ${String(tileType)}`,
                );
        }
    }

    private static resolveMissFieldLabel(
        miss: PreAggregateMatchMiss,
        explore: Explore,
        metricQuery: MetricQuery,
    ): string | null {
        const fieldId: FieldId | undefined =
            'fieldId' in miss ? miss.fieldId : undefined;
        if (!fieldId) return null;

        const exploreField = findFieldByIdInExplore(explore, fieldId);
        if (exploreField) return getItemLabel(exploreField);

        const additional = metricQuery.additionalMetrics?.find(
            (m) => `${m.table}_${m.name.replaceAll('.', '__')}` === fieldId,
        );
        if (additional?.label) return additional.label;

        const tableCalc = metricQuery.tableCalculations?.find(
            (tc) => tc.name === fieldId,
        );
        if (tableCalc) return tableCalc.displayName;

        const customDim = metricQuery.customDimensions?.find(
            (cd) => cd.id === fieldId,
        );
        if (customDim) return customDim.name;

        return null;
    }

    private static groupTilesByTab(
        dashboard: DashboardDAO,
        tileStatuses: TilePreAggregateAuditStatus[],
    ): TabAuditGroup[] {
        const order: Array<{ tabUuid: string | null; tabName: string | null }> =
            dashboard.tabs.length > 0
                ? dashboard.tabs.map((t) => ({
                      tabUuid: t.uuid,
                      tabName: t.name,
                  }))
                : [{ tabUuid: null, tabName: null }];

        const knownTabUuids = new Set(dashboard.tabs.map((t) => t.uuid));

        const byTab = new Map<string | null, TilePreAggregateAuditStatus[]>();
        for (const ordered of order) byTab.set(ordered.tabUuid, []);

        for (let i = 0; i < tileStatuses.length; i += 1) {
            const status = tileStatuses[i];
            const originalTile = dashboard.tiles[i];
            const rawTab = originalTile.tabUuid ?? null;
            const key =
                rawTab !== null && knownTabUuids.has(rawTab) ? rawTab : null;
            const bucket = byTab.get(key);
            if (bucket) {
                bucket.push(status);
            } else {
                byTab.set(null, (byTab.get(null) ?? []).concat(status));
            }
        }

        const result: TabAuditGroup[] = order.map(({ tabUuid, tabName }) => ({
            tabUuid,
            tabName,
            tiles: byTab.get(tabUuid) ?? [],
        }));

        const hasNullEntry = result.some((g) => g.tabUuid === null);
        const orphanTiles = hasNullEntry ? [] : (byTab.get(null) ?? []);
        if (orphanTiles.length > 0) {
            result.push({ tabUuid: null, tabName: null, tiles: orphanTiles });
        }

        return result;
    }

    private static summarize(
        tileStatuses: TilePreAggregateAuditStatus[],
    ): DashboardPreAggregateAudit['summary'] {
        let hitCount = 0;
        let missCount = 0;
        let ineligibleCount = 0;
        for (const t of tileStatuses) {
            if (t.status === 'hit') hitCount += 1;
            else if (t.status === 'miss') missCount += 1;
            else ineligibleCount += 1;
        }
        return { hitCount, missCount, ineligibleCount };
    }
}
