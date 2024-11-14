import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ChartHistory,
    ChartSummary,
    ChartType,
    ChartVersion,
    countCustomDimensionsInMetricQuery,
    countTotalFilterRules,
    CreateSavedChart,
    CreateSavedChartVersion,
    CreateSchedulerAndTargetsWithoutIds,
    ExploreType,
    ForbiddenError,
    generateSlug,
    getItemId,
    getTimezoneLabel,
    isChartScheduler,
    isConditionalFormattingConfigWithColorRange,
    isConditionalFormattingConfigWithSingleColor,
    isCustomSqlDimension,
    isExploreError,
    isUserWithOrg,
    isValidFrequency,
    ParameterError,
    SavedChart,
    SavedChartDAO,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    SpaceShare,
    TogglePinnedItemInfo,
    UpdatedByUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
    ViewStatistics,
    type CatalogFieldWhere,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import {
    ConditionalFormattingRuleSavedEvent,
    CreateSavedChartVersionEvent,
    LightdashAnalytics,
    SchedulerUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { getChartUsageFieldsToUpdate } from '../../models/CatalogModel/utils';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type SavedChartServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    dashboardModel: DashboardModel;
    catalogModel: CatalogModel;
};

export class SavedChartService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly savedChartModel: SavedChartModel;

    private readonly spaceModel: SpaceModel;

    private readonly analyticsModel: AnalyticsModel;

    private readonly pinnedListModel: PinnedListModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly slackClient: SlackClient;

    private readonly dashboardModel: DashboardModel;

    private readonly catalogModel: CatalogModel;

    constructor(args: SavedChartServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.savedChartModel = args.savedChartModel;
        this.spaceModel = args.spaceModel;
        this.analyticsModel = args.analyticsModel;
        this.pinnedListModel = args.pinnedListModel;
        this.schedulerModel = args.schedulerModel;
        this.schedulerClient = args.schedulerClient;
        this.slackClient = args.slackClient;
        this.dashboardModel = args.dashboardModel;
        this.catalogModel = args.catalogModel;
    }

    private async checkUpdateAccess(
        user: SessionUser,
        chartUuid: string,
    ): Promise<ChartSummary> {
        const savedChart = await this.savedChartModel.getSummary(chartUuid);
        const { organizationUuid, projectUuid } = savedChart;
        const space = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            savedChart.spaceUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }
        return savedChart;
    }

    private async checkCreateScheduledDeliveryAccess(
        user: SessionUser,
        chartUuid: string,
    ): Promise<ChartSummary> {
        const savedChart = await this.savedChartModel.getSummary(chartUuid);
        const { organizationUuid, projectUuid } = savedChart;
        if (
            user.ability.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!(await this.hasChartSpaceAccess(user, savedChart.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }
        return savedChart;
    }

    async hasChartSpaceAccess(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<boolean> {
        try {
            const space = await this.spaceModel.getSpaceSummary(spaceUuid);
            const access = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                space.uuid,
            );
            return hasViewAccessToSpace(user, space, access);
        } catch (e) {
            return false;
        }
    }

    static getCreateEventProperties(
        savedChart: SavedChartDAO,
    ): CreateSavedChartVersionEvent['properties'] {
        const echartsConfig =
            savedChart.chartConfig.type === ChartType.CARTESIAN
                ? savedChart.chartConfig.config?.eChartsConfig
                : undefined;
        const tableConfig =
            savedChart.chartConfig.type === ChartType.TABLE
                ? savedChart.chartConfig.config
                : undefined;

        return {
            title: savedChart.name,
            description: savedChart.description,
            projectId: savedChart.projectUuid,
            savedQueryId: savedChart.uuid,
            dimensionsCount: savedChart.metricQuery.dimensions.length,
            metricsCount: savedChart.metricQuery.metrics.length,
            filtersCount: countTotalFilterRules(savedChart.metricQuery.filters),
            sortsCount: savedChart.metricQuery.sorts.length,
            tableCalculationsCount:
                savedChart.metricQuery.tableCalculations.length,
            pivotCount: (savedChart.pivotConfig?.columns || []).length,
            chartType: savedChart.chartConfig.type,
            pie:
                savedChart.chartConfig.type === ChartType.PIE
                    ? {
                          isDonut:
                              savedChart.chartConfig?.config?.isDonut ?? false,
                      }
                    : undefined,
            funnel:
                savedChart.chartConfig.type === ChartType.FUNNEL
                    ? {
                          dataInput: savedChart.chartConfig?.config?.dataInput,
                      }
                    : undefined,
            table:
                savedChart.chartConfig.type === ChartType.TABLE
                    ? {
                          conditionalFormattingRulesCount:
                              tableConfig?.conditionalFormattings?.length || 0,
                          hasMetricsAsRows: !!tableConfig?.metricsAsRows,
                          hasRowCalculation: !!tableConfig?.showRowCalculation,
                          hasColumnCalculations:
                              !!tableConfig?.showColumnCalculation,
                      }
                    : undefined,

            bigValue:
                savedChart.chartConfig.type === ChartType.BIG_NUMBER
                    ? {
                          hasBigValueComparison:
                              savedChart.chartConfig.config?.showComparison,
                      }
                    : undefined,
            cartesian:
                savedChart.chartConfig.type === ChartType.CARTESIAN
                    ? {
                          xAxisCount: (
                              savedChart.chartConfig.config?.eChartsConfig
                                  .xAxis || []
                          ).length,
                          yAxisCount: (
                              savedChart.chartConfig.config?.eChartsConfig
                                  .yAxis || []
                          ).length,
                          seriesTypes: (
                              savedChart.chartConfig.config?.eChartsConfig
                                  .series || []
                          ).map(({ type }) => type),
                          seriesCount: (
                              savedChart.chartConfig.config?.eChartsConfig
                                  .series || []
                          ).length,
                          referenceLinesCount:
                              echartsConfig?.series?.filter(
                                  (serie) => serie.markLine?.data !== undefined,
                              ).length || 0,
                          margins:
                              echartsConfig?.grid?.top === undefined
                                  ? 'default'
                                  : 'custom',
                          showLegend: echartsConfig?.legend?.show !== false,
                      }
                    : undefined,
            ...countCustomDimensionsInMetricQuery(savedChart.metricQuery),
        };
    }

    static getConditionalFormattingEventProperties(
        savedChart: SavedChartDAO,
    ): ConditionalFormattingRuleSavedEvent['properties'][] | undefined {
        if (
            savedChart.chartConfig.type !== ChartType.TABLE ||
            !savedChart.chartConfig.config?.conditionalFormattings ||
            savedChart.chartConfig.config.conditionalFormattings.length === 0
        ) {
            return undefined;
        }

        const eventProperties =
            savedChart.chartConfig.config.conditionalFormattings.map((rule) => {
                let type: 'color range' | 'single color';
                let numConditions: number;

                if (isConditionalFormattingConfigWithColorRange(rule)) {
                    type = 'color range';
                    numConditions = 1;
                } else if (isConditionalFormattingConfigWithSingleColor(rule)) {
                    type = 'single color';
                    numConditions = rule.rules.length;
                } else {
                    type = assertUnreachable(
                        rule,
                        'Unknown conditional formatting',
                    );
                    numConditions = 0;
                }

                return {
                    projectId: savedChart.projectUuid,
                    organizationId: savedChart.organizationUuid,
                    savedQueryId: savedChart.uuid,
                    type,
                    numConditions,
                };
            });

        return eventProperties;
    }

    private async updateChartFieldUsage(
        projectUuid: string,
        chartExplore: Explore | ExploreError,
        chartFields: {
            oldChartFields: string[];
            newChartFields: string[];
        },
    ) {
        const fieldsToUpdate = await getChartUsageFieldsToUpdate(
            projectUuid,
            chartExplore,
            chartFields,
            this.catalogModel.findTablesCachedExploreUuid.bind(
                this.catalogModel,
            ),
        );

        await this.catalogModel.updateChartUsages(projectUuid, fieldsToUpdate);
    }

    async createVersion(
        user: SessionUser,
        savedChartUuid: string,
        data: CreateSavedChartVersion,
    ): Promise<SavedChart> {
        const {
            organizationUuid,
            projectUuid,
            spaceUuid,
            metricQuery: {
                metrics: oldChartMetrics,
                dimensions: oldChartDimensions,
            },
        } = await this.savedChartModel.get(savedChartUuid);

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );

        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            data.metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot save queries with custom SQL dimensions',
            );
        }

        const savedChart = await this.savedChartModel.createVersion(
            savedChartUuid,
            data,
            user,
        );

        this.analytics.track({
            event: 'saved_chart_version.created',
            userId: user.userUuid,
            properties: SavedChartService.getCreateEventProperties(savedChart),
        });

        SavedChartService.getConditionalFormattingEventProperties(
            savedChart,
        )?.forEach((properties) => {
            this.analytics.track({
                event: 'conditional_formatting_rule.saved',
                userId: user.userUuid,
                properties,
            });
        });

        try {
            const cachedExplore = await this.projectModel.getExploreFromCache(
                projectUuid,
                savedChart.tableName,
            );

            await this.updateChartFieldUsage(projectUuid, cachedExplore, {
                oldChartFields: [...oldChartMetrics, ...oldChartDimensions],
                newChartFields: [
                    ...data.metricQuery.metrics,
                    ...data.metricQuery.dimensions,
                ],
            });
        } catch (error) {
            this.logger.error(
                `Error updating chart field usage for chart ${savedChartUuid}`,
                error,
            );
        }

        return {
            ...savedChart,
            isPrivate: space.isPrivate,
            access,
        };
    }

    async update(
        user: SessionUser,
        savedChartUuid: string,
        data: UpdateSavedChart,
    ): Promise<SavedChart> {
        const {
            organizationUuid,
            projectUuid,
            spaceUuid,
            dashboardUuid,
            name,
        } = await this.savedChartModel.getSummary(savedChartUuid);

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );

        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }

        const savedChart = await this.savedChartModel.update(
            savedChartUuid,
            data,
        );

        const cachedExplore = await this.projectModel.getExploreFromCache(
            projectUuid,
            savedChart.tableName,
        );
        this.analytics.track({
            event: 'saved_chart.updated',
            userId: user.userUuid,
            properties: {
                projectId: savedChart.projectUuid,
                savedQueryId: savedChartUuid,
                dashboardId: savedChart.dashboardUuid ?? undefined,
                virtualViewId:
                    cachedExplore?.type === ExploreType.VIRTUAL
                        ? cachedExplore.name
                        : undefined,
            },
        });
        if (dashboardUuid && !savedChart.dashboardUuid) {
            this.analytics.track({
                event: 'dashboard_chart.moved',
                userId: user.userUuid,
                properties: {
                    projectId: savedChart.projectUuid,
                    savedQueryId: savedChartUuid,
                    dashboardId: dashboardUuid,
                    spaceId: savedChart.spaceUuid,
                },
            });
        }
        return {
            ...savedChart,
            isPrivate: space.isPrivate,
            access,
        };
    }

    async togglePinning(
        user: SessionUser,
        savedChartUuid: string,
    ): Promise<TogglePinnedItemInfo> {
        const { organizationUuid, projectUuid, pinnedListUuid, spaceUuid } =
            await this.savedChartModel.getSummary(savedChartUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('PinnedItems', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasChartSpaceAccess(user, spaceUuid))) {
            throw new ForbiddenError();
        }

        if (pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid,
                savedChartUuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                savedChartUuid,
            });
        }
        const pinnedList = await this.pinnedListModel.getPinnedListAndItems(
            projectUuid,
        );

        this.analytics.track({
            event: 'pinned_list.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                location: 'homepage',
                pinnedListId: pinnedList.pinnedListUuid,
                pinnedItems: pinnedList.items,
            },
        });

        return {
            projectUuid,
            spaceUuid,
            pinnedListUuid: pinnedList.pinnedListUuid,
            isPinned: !!pinnedList.items.find(
                (item) => item.savedChartUuid === savedChartUuid,
            ),
        };
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: string,
        data: UpdateMultipleSavedChart[],
    ): Promise<SavedChart[]> {
        const project = await this.projectModel.getSummary(projectUuid);

        const spaceAccessPromises = data.map(async (chart) => {
            const space = await this.spaceModel.getSpaceSummary(
                chart.spaceUuid,
            );
            const access = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                chart.spaceUuid,
            );
            return user.ability.can(
                'update',
                subject('SavedChart', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            );
        });

        const hasAllAccess = await Promise.all(spaceAccessPromises);
        if (hasAllAccess.includes(false)) {
            throw new ForbiddenError();
        }

        const savedChartsDaos = await this.savedChartModel.updateMultiple(data);
        const savedCharts = await Promise.all(
            savedChartsDaos.map(async (savedChart) => {
                const space = await this.spaceModel.getSpaceSummary(
                    savedChart.spaceUuid,
                );
                const access = await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    savedChart.spaceUuid,
                );
                return {
                    ...savedChart,
                    isPrivate: space.isPrivate,
                    access,
                };
            }),
        );
        this.analytics.track({
            event: 'saved_chart.updated_multiple',
            userId: user.userUuid,
            properties: {
                savedChartIds: data.map((chart) => chart.uuid),
                projectId: projectUuid,
            },
        });
        return savedCharts;
    }

    async delete(user: SessionUser, savedChartUuid: string): Promise<void> {
        const {
            organizationUuid,
            projectUuid,
            spaceUuid,
            metricQuery: { metrics, dimensions },
            tableName,
        } = await this.savedChartModel.get(savedChartUuid);
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );

        if (
            user.ability.cannot(
                'delete',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const deletedChart = await this.savedChartModel.delete(savedChartUuid);

        try {
            const cachedExplore = await this.projectModel.getExploreFromCache(
                projectUuid,
                tableName,
            );

            await this.updateChartFieldUsage(projectUuid, cachedExplore, {
                oldChartFields: [...metrics, ...dimensions],
                newChartFields: [],
            });
        } catch (error) {
            this.logger.error(
                `Error updating chart field usage for chart ${savedChartUuid}`,
                error,
            );
        }

        this.analytics.track({
            event: 'saved_chart.deleted',
            userId: user.userUuid,
            properties: {
                savedQueryId: deletedChart.uuid,
                projectId: deletedChart.projectUuid,
            },
        });
    }

    async getViewStats(
        user: SessionUser,
        savedChartUuid: string,
    ): Promise<ViewStatistics> {
        const savedChart = await this.savedChartModel.getSummary(
            savedChartUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            savedChart.spaceUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    ...savedChart,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }
        return this.analyticsModel.getChartViewStats(savedChartUuid);
    }

    async get(savedChartUuid: string, user: SessionUser): Promise<SavedChart> {
        const savedChart = await this.savedChartModel.get(savedChartUuid);
        const space = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            savedChart.spaceUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    ...savedChart,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }

        await this.analyticsModel.addChartViewEvent(
            savedChartUuid,
            user.userUuid,
        );

        this.analytics.track({
            event: 'saved_chart.view',
            userId: user.userUuid,
            properties: {
                savedChartId: savedChart.uuid,
                organizationId: savedChart.organizationUuid,
                projectId: savedChart.projectUuid,
            },
        });

        return {
            ...savedChart,
            isPrivate: space.isPrivate,
            access,
        };
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        savedChart: CreateSavedChart,
    ): Promise<SavedChart> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        let isPrivate = false;
        let access: SpaceShare[] = [];
        if (savedChart.spaceUuid) {
            const space = await this.spaceModel.getSpaceSummary(
                savedChart.spaceUuid,
            );
            isPrivate = space.isPrivate;
            access = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                savedChart.spaceUuid,
            );
        } else if (savedChart.dashboardUuid) {
            const dashboard = await this.dashboardModel.getById(
                savedChart.dashboardUuid,
            );
            const space = await this.spaceModel.getSpaceSummary(
                dashboard.spaceUuid,
            );
            isPrivate = space.isPrivate;
            access = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                dashboard.spaceUuid,
            );
        }

        if (
            user.ability.cannot(
                'create',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const newSavedChart = await this.savedChartModel.create(
            projectUuid,
            user.userUuid,
            {
                ...savedChart,
                slug: generateSlug(savedChart.name),
                updatedByUser: user,
            },
        );

        const cachedExplore = await this.projectModel.getExploreFromCache(
            projectUuid,
            savedChart.tableName,
        );

        this.analytics.track({
            event: 'saved_chart.created',
            userId: user.userUuid,
            properties: {
                ...SavedChartService.getCreateEventProperties(newSavedChart),
                dashboardId: newSavedChart.dashboardUuid ?? undefined,
                virtualViewId:
                    cachedExplore?.type === ExploreType.VIRTUAL
                        ? cachedExplore.name
                        : undefined,
            },
        });

        SavedChartService.getConditionalFormattingEventProperties(
            newSavedChart,
        )?.forEach((properties) => {
            this.analytics.track({
                event: 'conditional_formatting_rule.saved',
                userId: user.userUuid,
                properties,
            });
        });

        try {
            await this.updateChartFieldUsage(projectUuid, cachedExplore, {
                oldChartFields: [],
                newChartFields: [
                    ...newSavedChart.metricQuery.metrics,
                    ...newSavedChart.metricQuery.dimensions,
                ],
            });
        } catch (error) {
            this.logger.error(
                `Error updating chart field usage for chart ${newSavedChart.uuid}`,
                error,
            );
        }

        return { ...newSavedChart, isPrivate, access };
    }

    async duplicate(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
        data: { chartName: string; chartDesc: string },
    ): Promise<SavedChart> {
        const chart = await this.savedChartModel.get(chartUuid);
        const space = await this.spaceModel.getSpaceSummary(chart.spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            chart.spaceUuid,
        );
        if (
            user.ability.cannot(
                'create',
                subject('SavedChart', {
                    ...chart,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }
        let duplicatedChart: CreateSavedChart & {
            updatedByUser: UpdatedByUser;
            slug: string;
        };

        const base = {
            ...chart,
            name: data.chartName,
            description: data.chartDesc,
            updatedByUser: user,
            slug: generateSlug(`${data.chartName} ${Date.now()}`), // Ensure unique slug for duplicated charts
        };
        if (chart.dashboardUuid) {
            duplicatedChart = {
                ...base,
                dashboardUuid: chart.dashboardUuid,
                spaceUuid: null,
            };
        } else {
            duplicatedChart = {
                ...base,
                dashboardUuid: null,
            };
        }

        const newSavedChart = await this.savedChartModel.create(
            projectUuid,
            user.userUuid,
            duplicatedChart,
        );
        const newSavedChartProperties =
            SavedChartService.getCreateEventProperties(newSavedChart);

        const cachedExplore = await this.projectModel.getExploreFromCache(
            projectUuid,
            newSavedChart.tableName,
        );

        this.analytics.track({
            event: 'saved_chart.created',
            userId: user.userUuid,
            properties: {
                ...newSavedChartProperties,
                duplicated: true,
                dashboardId: newSavedChart.dashboardUuid ?? undefined,
                virtualViewId:
                    cachedExplore?.type === ExploreType.VIRTUAL
                        ? cachedExplore.name
                        : undefined,
            },
        });

        this.analytics.track({
            event: 'duplicated_chart_created',
            userId: user.userUuid,
            properties: {
                ...newSavedChartProperties,
                newSavedQueryId: newSavedChartProperties.savedQueryId,
                duplicateOfSavedQueryId: chartUuid,
            },
        });

        try {
            await this.updateChartFieldUsage(projectUuid, cachedExplore, {
                oldChartFields: [],
                newChartFields: [
                    ...newSavedChart.metricQuery.metrics,
                    ...newSavedChart.metricQuery.dimensions,
                ],
            });
        } catch (error) {
            this.logger.error(
                `Error updating chart field usage for chart ${newSavedChart.uuid}`,
                error,
            );
        }

        return { ...newSavedChart, isPrivate: space.isPrivate, access };
    }

    async getSchedulers(
        user: SessionUser,
        chartUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        await this.checkCreateScheduledDeliveryAccess(user, chartUuid);
        return this.schedulerModel.getChartSchedulers(chartUuid);
    }

    async createScheduler(
        user: SessionUser,
        chartUuid: string,
        newScheduler: CreateSchedulerAndTargetsWithoutIds,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        if (!isValidFrequency(newScheduler.cron)) {
            throw new ParameterError(
                'Frequency not allowed, custom input is limited to hourly',
            );
        }
        const { projectUuid, organizationUuid } =
            await this.checkCreateScheduledDeliveryAccess(user, chartUuid);
        const scheduler = await this.schedulerModel.createScheduler({
            ...newScheduler,
            createdBy: user.userUuid,
            dashboardUuid: null,
            savedChartUuid: chartUuid,
        });

        const createSchedulerEventData: SchedulerUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.created',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                resourceType: isChartScheduler(scheduler)
                    ? 'chart'
                    : 'dashboard',
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
                resourceId: isChartScheduler(scheduler)
                    ? scheduler.savedChartUuid
                    : scheduler.dashboardUuid,
                targets:
                    scheduler.format === SchedulerFormat.GSHEETS
                        ? []
                        : scheduler.targets.map(getSchedulerTargetType),
                timeZone: getTimezoneLabel(scheduler.timezone),
                includeLinks: scheduler.includeLinks,
            },
        };
        this.analytics.track(createSchedulerEventData);

        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        const { schedulerTimezone: defaultTimezone } =
            await this.projectModel.get(projectUuid);

        await this.schedulerClient.generateDailyJobsForScheduler(
            scheduler,
            defaultTimezone,
        );

        return scheduler;
    }

    async getHistory(
        user: SessionUser,
        chartUuid: string,
    ): Promise<ChartHistory> {
        const chart = await this.savedChartModel.getSummary(chartUuid);
        const space = await this.spaceModel.getSpaceSummary(chart.spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            chart.spaceUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    ...chart,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }
        const versions = await this.savedChartModel.getLatestVersionSummaries(
            chartUuid,
        );
        this.analytics.track({
            event: 'saved_chart_history.view',
            userId: user.userUuid,
            properties: {
                projectId: chart.projectUuid,
                savedQueryId: chart.uuid,
                versionCount: versions.length,
            },
        });
        return {
            history: versions,
        };
    }

    async getVersion(
        user: SessionUser,
        chartUuid: string,
        versionUuid: string,
    ): Promise<ChartVersion> {
        const chart = await this.savedChartModel.getSummary(chartUuid);
        const space = await this.spaceModel.getSpaceSummary(chart.spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            chart.spaceUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    ...chart,
                    isPrivate: space.isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this chart belongs to",
            );
        }

        const [chartVersionSummary, savedChart] = await Promise.all([
            this.savedChartModel.getVersionSummary(chartUuid, versionUuid),
            this.savedChartModel.get(chartUuid, versionUuid),
        ]);

        this.analytics.track({
            event: 'saved_chart_version.view',
            userId: user.userUuid,
            properties: {
                projectId: chart.projectUuid,
                savedQueryId: chart.uuid,
                versionId: versionUuid,
            },
        });

        return {
            ...chartVersionSummary,
            chart: { ...savedChart, isPrivate: space.isPrivate, access },
        };
    }

    async rollback(
        user: SessionUser,
        chartUuid: string,
        versionUuid: string,
    ): Promise<void> {
        await this.checkUpdateAccess(user, chartUuid);
        const currentChartVersion = await this.savedChartModel.get(chartUuid);
        const chartVersion = await this.savedChartModel.get(
            chartUuid,
            versionUuid,
        );
        const newChartVersion = await this.savedChartModel.createVersion(
            chartUuid,
            chartVersion,
            user,
        );
        this.analytics.track({
            event: 'saved_chart_version.rollback',
            userId: user.userUuid,
            properties: {
                projectId: newChartVersion.projectUuid,
                savedQueryId: newChartVersion.uuid,
                versionId: versionUuid,
            },
        });
        this.analytics.track({
            event: 'saved_chart_version.created',
            userId: user.userUuid,
            properties:
                SavedChartService.getCreateEventProperties(newChartVersion),
        });

        try {
            const cachedExplore = await this.projectModel.getExploreFromCache(
                newChartVersion.projectUuid,
                newChartVersion.tableName,
            );

            await this.updateChartFieldUsage(
                newChartVersion.projectUuid,
                cachedExplore,
                {
                    oldChartFields: [
                        ...currentChartVersion.metricQuery.metrics,
                        ...currentChartVersion.metricQuery.dimensions,
                    ],
                    newChartFields: [
                        ...newChartVersion.metricQuery.metrics,
                        ...newChartVersion.metricQuery.dimensions,
                    ],
                },
            );
        } catch (error) {
            this.logger.error(
                `Error updating chart field usage for chart ${newChartVersion.uuid}`,
                error,
            );
        }
    }
}
