import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartSummary,
    DashboardDAO,
    ForbiddenError,
    isChartTile,
    NotFoundError,
    PromotedChart as PromotedChangeChart,
    PromotedSpace,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    UnexpectedServerError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

type PromotedChart = {
    projectUuid: string;
    chart: SavedChartDAO;
    space: Omit<SpaceSummary, 'userAccess'>; // even if chart belongs to dashboard, this is not undefined
    access: SpaceShare[];
};
type UpstreamChart = {
    projectUuid: string;
    chart: ChartSummary | undefined;
    space: Omit<SpaceSummary, 'userAccess'> | undefined;
    access: SpaceShare[];
    dashboardUuid?: string; // dashboard uuid if chart belongs to dashboard
};
type PromotedDashboard = {
    projectUuid: string;
    dashboard: DashboardDAO;
    space: Omit<SpaceSummary, 'userAccess'>;
    access: SpaceShare[];
};

type UpstreamDashboard = {
    projectUuid: string;
    dashboard:
        | Pick<DashboardDAO, 'uuid' | 'name' | 'spaceUuid' | 'description'>
        | undefined;
    space: Omit<SpaceSummary, 'userAccess'> | undefined;
    access: SpaceShare[];
};

type PromoteServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
};

export class PromoteService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly savedChartModel: SavedChartModel;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly dashboardModel: DashboardModel;

    constructor(args: PromoteServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.savedChartModel = args.savedChartModel;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.dashboardModel = args.dashboardModel;
    }

    private async trackAnalytics(
        user: SessionUser,
        event: 'promote.executed' | 'promote.error',
        promotedContent: PromotedChart | PromotedDashboard,
        upstreamContent: UpstreamChart | UpstreamDashboard,
        error?: string,
    ) {
        this.analytics.track({
            event,
            userId: user.userUuid,
            properties: {
                chartId:
                    'chart' in promotedContent
                        ? promotedContent.chart.uuid
                        : undefined,
                dashboardId:
                    'dashboard' in promotedContent
                        ? promotedContent.dashboard.uuid
                        : undefined,
                fromProjectId: promotedContent.projectUuid,
                toProjectId: upstreamContent.projectUuid,
                organizationId: user.organizationUuid!,
                slug:
                    'chart' in promotedContent
                        ? promotedContent.chart.slug
                        : promotedContent.dashboard.slug,
                withNewSpace: upstreamContent.space === undefined,
                hasExistingContent:
                    'chart' in upstreamContent
                        ? upstreamContent.chart !== undefined
                        : upstreamContent.dashboard !== undefined,
                chartsCount:
                    'dashboard' in promotedContent
                        ? promotedContent.dashboard.tiles.filter(isChartTile)
                              .length
                        : undefined,
                error,
            },
        });
    }

    private async getPromoteCharts(
        user: SessionUser,
        upstreamProjectUuid: string,
        chartUuid: string,
    ): Promise<{
        promotedChart: PromotedChart;
        upstreamChart: UpstreamChart;
    }> {
        const savedChart = await this.savedChartModel.get(chartUuid, undefined);

        const promotedSpace = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );
        const upstreamCharts = await this.savedChartModel.find({
            projectUuid: upstreamProjectUuid,
            slug: savedChart.slug,
        });
        if (upstreamCharts.length > 1) {
            throw new AlreadyExistsError(
                `There are multiple charts with the same identifier ${savedChart.slug}`,
            );
        }
        const upstreamChart =
            upstreamCharts.length === 1 ? upstreamCharts[0] : undefined;
        const upstreamSpaces = await this.spaceModel.find({
            projectUuid: upstreamProjectUuid,
            slug: promotedSpace.slug,
        });
        if (upstreamSpaces.length > 1) {
            throw new AlreadyExistsError(
                `There are multiple spaces with the same identifier ${promotedSpace.slug}`,
            );
        }
        const upstreamSpace =
            upstreamSpaces.length === 1 ? upstreamSpaces[0] : undefined;

        return {
            promotedChart: {
                chart: savedChart,
                projectUuid: upstreamProjectUuid,
                space: promotedSpace,
                access: await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    promotedSpace.uuid,
                ),
            },
            upstreamChart: {
                chart: upstreamChart,
                projectUuid: upstreamProjectUuid,
                space: upstreamSpace,
                access: upstreamSpace
                    ? await this.spaceModel.getUserSpaceAccess(
                          user.userUuid,
                          upstreamSpace.uuid,
                      )
                    : [],
            },
        };
    }

    private static checkPromoteSpacePermissions(
        user: SessionUser,
        promotedContent: PromotedChart | PromotedDashboard,
        upstreamContent: UpstreamChart | UpstreamDashboard,
        promotedDashboard?: PromotedDashboard,
    ) {
        const { organizationUuid } = user;

        if (promotedContent.space?.isPrivate) {
            const chartName =
                'chart' in promotedContent ? promotedContent.chart.name : '';
            throw new ForbiddenError(
                promotedDashboard
                    ? `Failed to promote dashboard: this dashboard uses a chart "${chartName}" which belongs to a private space "${promotedContent.space?.name}". You cannot promote content from private spaces.`
                    : `Failed to promote: We can't promote content on private spaces.`,
            );
        }
        if (upstreamContent.space?.isPrivate) {
            const chartName =
                'chart' in promotedContent ? promotedContent.chart.name : '';
            throw new ForbiddenError(
                promotedDashboard
                    ? `Failed to promote dashboard: this dashboard uses a chart "${chartName}" which belongs to a private space "${promotedContent.space?.name}" in the upstream project. You cannot promote content to private spaces.`
                    : `Failed to promote: We can't promote content to private spaces.`,
            );
        }

        if (upstreamContent.space) {
            // If upstreamContent has a matching space, we check if we have access
            if (
                user.ability.cannot(
                    'manage',
                    subject('Space', {
                        organizationUuid,
                        projectUuid: upstreamContent.projectUuid,
                        access: upstreamContent.access,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    `Failed to promote: you do not have access to modify this space "${upstreamContent.space.name}" in the upstream project.`,
                );
            }
        } // If upstreamContent has no space, we check if we have permissions to create new spaces
        else if (
            user.ability.cannot(
                'create',
                subject('Space', {
                    organizationUuid,
                    projectUuid: upstreamContent.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                `Failed to promote: you do not have access to create a space in the upstream project.`,
            );
        }
    }

    private static checkPromoteChartPermissions(
        user: SessionUser,
        promotedChart: PromotedChart,
        upstreamChart: UpstreamChart,
        promotedDashboard?: PromotedDashboard,
    ) {
        const { organizationUuid } = user;
        // Check permissions on `from project`
        if (promotedChart.space) {
            // Charts within space
            if (
                user.ability.cannot(
                    'promote',
                    subject('SavedChart', {
                        organizationUuid,
                        projectUuid: promotedChart.projectUuid,
                        isPrivate: promotedChart.space.isPrivate,
                        access: promotedChart.access,
                    }),
                )
            )
                throw new ForbiddenError(
                    promotedDashboard
                        ? `Failed to promote dashboard: this dashboard uses a chart "${promotedChart.chart.name}" which you don't have access to edit in the origin project.`
                        : `Failed to promote chart: you don't have access to edit this chart in the origin project.`,
                );
        } // Charts within dashboard
        else if (
            user.ability.cannot(
                'promote',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid: promotedChart.projectUuid,
                }),
            )
        )
            throw new ForbiddenError(
                promotedDashboard
                    ? `Failed to promote dashboard: this dashboard uses a chart within dashboard "${promotedChart.chart.name}" which you don't have access to edit in the origin project.`
                    : `Failed to promote chart: you don't have access to edit this chart within dashboard in the origin project.`,
            );

        // Check permissions on `upstream project`
        if (upstreamChart.chart !== undefined) {
            // If upstreamContent has a matching chart, we check if we have access

            if (upstreamChart.space) {
                if (
                    user.ability.cannot(
                        'promote',
                        subject('SavedChart', {
                            organizationUuid,
                            projectUuid: upstreamChart.projectUuid,
                            isPrivate: upstreamChart.space.isPrivate,
                            access: upstreamChart.access,
                        }),
                    )
                ) {
                    throw new ForbiddenError(
                        promotedDashboard
                            ? `Failed to promote dashboard: this dashboard uses a chart "${promotedChart.chart.name}" which you don't have access to edit in the upstream project.`
                            : `Failed to promote chart: you don't have access to edit this chart in the upstream project.`,
                    );
                }
            } else if (
                user.ability.cannot(
                    'promote',
                    subject('SavedChart', {
                        organizationUuid,
                        projectUuid: upstreamChart.projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    promotedDashboard
                        ? `Failed to promote dashboard: this dashboard uses a chart within dashboard "${promotedChart.chart.name}" which you don't have access to edit in the upstream project.`
                        : `Failed to promote chart: you don't have access to edit this chart within dashboard in the upstream project.`,
                );
            }
        } else if (upstreamChart.space !== undefined) {
            // If upstreamContent has no matching chart, we check if we have access to create, if space already exists
            if (
                user.ability.cannot(
                    'manage',
                    subject('SavedChart', {
                        organizationUuid,
                        projectUuid: upstreamChart.projectUuid,
                        access: upstreamChart.access,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    promotedDashboard
                        ? `Failed to promote dashboard: this dashboard uses a chart "${promotedChart.chart.name}" which belongs to a space ${upstreamChart.space.name} you don't have access to edit in the upstream project.`
                        : `Failed to promote chart: this chart belongs to a space ${upstreamChart.space.name} you don't have access to edit in the upstream project.`,
                );
            }
        }

        PromoteService.checkPromoteSpacePermissions(
            user,
            promotedChart,
            upstreamChart,
            promotedDashboard,
        );
    }

    private static checkPromoteDashboardPermissions(
        user: SessionUser,
        promotedDashboard: PromotedDashboard,
        upstreamDashboard: UpstreamDashboard,
    ) {
        // Check permissions on `from project`
        const { organizationUuid } = user;
        if (
            user.ability.cannot(
                'promote',
                subject('Dashboard', {
                    organizationUuid,
                    projectUuid: promotedDashboard.projectUuid,
                    isPrivate: promotedDashboard.space.isPrivate,
                    access: promotedDashboard.access,
                }),
            )
        )
            throw new ForbiddenError(
                `Failed to promote dashboard: You do not have the right access permissions on the origin space and dashboard to promote.`,
            );

        // Check permissions on `upstream project`
        if (upstreamDashboard.dashboard !== undefined) {
            // If upstreamContent has a matching chart, we check if we have access

            if (upstreamDashboard.space) {
                if (
                    user.ability.cannot(
                        'promote',
                        subject('Dashboard', {
                            organizationUuid,
                            projectUuid: upstreamDashboard.projectUuid,
                            isPrivate: upstreamDashboard.space.isPrivate,
                            access: upstreamDashboard.access,
                        }),
                    )
                ) {
                    throw new ForbiddenError(
                        `Failed to promote dashboard: You do not have the right access permissions on the destination space and dashboard to promote.`,
                    );
                }
            } else if (
                user.ability.cannot(
                    'promote',
                    subject('Dashboard', {
                        organizationUuid,
                        projectUuid: upstreamDashboard.projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    `Failed to promote dashboard: You do not have the right access permissions on the destination dashboard to promote.`,
                );
            }
        } else if (upstreamDashboard.space !== undefined) {
            // If upstreamContent has no matching dashboard, we check if we have access to create, if space already exists
            if (
                user.ability.cannot(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid,
                        projectUuid: upstreamDashboard.projectUuid,
                        access: upstreamDashboard.access,
                    }),
                )
            ) {
                throw new ForbiddenError(
                    `Failed to promote dashboard: You do not have the right access permissions on the destination to create dashboards.`,
                );
            }
        }
        PromoteService.checkPromoteSpacePermissions(
            user,
            promotedDashboard,
            upstreamDashboard,
        );
    }

    private async getOrCreateSpace(
        user: SessionUser,
        promotedContent: PromotedChart | PromotedDashboard,
        upstreamContent: UpstreamChart | UpstreamDashboard,
    ): Promise<{ uuid: string; isNew: boolean }> {
        if (promotedContent.space === undefined)
            throw new UnexpectedServerError(
                `Invalid space for promoted content`,
            );
        if (upstreamContent.space) {
            return { uuid: upstreamContent.space.uuid, isNew: false };
        }
        const newSpace = await this.spaceModel.createSpace(
            upstreamContent.projectUuid,
            promotedContent.space.name,
            user.userId,
            promotedContent.space.isPrivate,
            promotedContent.space.slug,
        );
        return { uuid: newSpace.uuid, isNew: true };
    }

    private async upsertChart(
        user: SessionUser,
        promotedContent: PromotedChart,
        upstreamContent: UpstreamChart,
    ) {
        const upstreamChart = upstreamContent.chart;
        const promotedChart = promotedContent.chart;
        if (upstreamChart === undefined) {
            // Create chart
            if (promotedChart?.dashboardUuid) {
                // Create chart in dashboard
                return this.savedChartModel.create(
                    upstreamContent.projectUuid,
                    user.userUuid,
                    {
                        ...promotedChart,
                        dashboardUuid: upstreamContent.dashboardUuid,
                        spaceUuid: undefined,
                        updatedByUser: user,
                        slug: promotedChart.slug,
                    },
                );
            }

            // Create chart in space
            const space = await this.getOrCreateSpace(
                user,
                promotedContent,
                upstreamContent,
            );

            return this.savedChartModel.create(
                upstreamContent.projectUuid,
                user.userUuid,
                {
                    ...promotedChart,
                    dashboardUuid: undefined,
                    spaceUuid: space.uuid,
                    updatedByUser: user,
                    slug: promotedChart.slug,
                },
            );
        }

        if (
            upstreamChart.name !== promotedChart.name ||
            upstreamChart.description !== promotedChart.description ||
            upstreamChart.spaceUuid !== upstreamContent.space?.uuid
        ) {
            // We also update chart name and description if they have changed
            await this.savedChartModel.update(upstreamChart.uuid, {
                name: promotedChart.name,
                description: promotedChart.description,
                spaceUuid: upstreamContent.space?.uuid,
            });
        }
        // update chart
        // TODO check if version needs to change ?
        const updatedChart = await this.savedChartModel.createVersion(
            upstreamChart.uuid,
            {
                tableName: promotedChart.tableName,
                metricQuery: promotedChart.metricQuery,
                chartConfig: promotedChart.chartConfig,
                tableConfig: promotedChart.tableConfig,
                dashboardUuid: upstreamContent.dashboardUuid,
            },
            user,
        );
        return updatedChart;
    }

    async upsertCharts(
        user: SessionUser,
        promotionChanges: PromotionChanges,
    ): Promise<PromotionChanges> {
        const { charts } = promotionChanges;
        const promotedDashboardUuid = promotionChanges.dashboards[0].data.uuid;

        const existingCharts = charts.filter(
            (change) => change.action === PromotionAction.NO_CHANGES,
        );

        await Promise.all(
            charts
                .filter((change) => change.action === PromotionAction.UPDATE)
                .map((chartChange) => {
                    const promotedChart = chartChange.data;

                    const chartSpace = PromoteService.getSpaceBySlug(
                        promotionChanges.spaces,
                        promotedChart.spaceSlug,
                    );
                    // TODO check if description needs to changed
                    // We also update chart name and description if they have changed
                    return this.savedChartModel.update(chartSpace.uuid, {
                        name: promotedChart.name,
                        description: promotedChart.description,
                        spaceUuid: chartSpace.uuid,
                    });
                }),
        );

        const updatedChartPromises = charts
            .filter((change) => change.action === PromotionAction.UPDATE)
            .map((chartChange) => {
                const promotedChart = chartChange.data;
                const chartSpace = PromoteService.getSpaceBySlug(
                    promotionChanges.spaces,
                    promotedChart.spaceSlug,
                );

                // update chart
                // TODO check if version needs to change ?
                return this.savedChartModel
                    .createVersion(
                        chartSpace.uuid,
                        {
                            tableName: promotedChart.tableName,
                            metricQuery: promotedChart.metricQuery,
                            chartConfig: promotedChart.chartConfig,
                            tableConfig: promotedChart.tableConfig,
                            dashboardUuid: promotedDashboardUuid,
                        },
                        user,
                    )
                    .then((updatedChart) => ({
                        ...updatedChart,
                        spaceSlug: promotedChart.spaceSlug,
                    }));
            });
        const updatedCharts = await Promise.all(updatedChartPromises);

        const createdChartPromises: Promise<[string, PromotedChangeChart]>[] =
            promotionChanges.charts
                .filter((change) => change.action === PromotionAction.CREATE)
                .map((chartChange) => {
                    const promotedChart = chartChange.data;

                    // Update dashboard with new space if it was created
                    const chartSpace = PromoteService.getSpaceBySlug(
                        promotionChanges.spaces,
                        promotedChart.spaceSlug,
                    );

                    // For charts created within dashboard, we point to the new created dashboard
                    const isChartWithinDashboard =
                        promotedChart?.dashboardUuid !== null;

                    const chartData = isChartWithinDashboard
                        ? {
                              ...promotedChart,
                              dashboardUuid: promotedDashboardUuid,
                              spaceUuid: null,
                              updatedByUser: user,
                              slug: promotedChart.slug,
                          }
                        : {
                              ...promotedChart,
                              dashboardUuid: null,
                              spaceUuid: chartSpace.uuid,
                              updatedByUser: user,
                              slug: promotedChart.slug,
                          };
                    return this.savedChartModel
                        .create(
                            promotedChart.projectUuid,
                            user.userUuid,
                            chartData,
                        )
                        .then((chart) => [
                            promotedChart.uuid,
                            {
                                ...chart,
                                spaceSlug: promotedChart.spaceSlug,
                            },
                        ]);
                });
        const createdCharts = await Promise.all(createdChartPromises);

        // We update the dashboard tiles with the chart uuids we've just insterted
        const updatedDashboardsWithChartUuids = promotionChanges.dashboards.map(
            (dashboardChange) => ({
                ...dashboardChange,
                data: {
                    ...dashboardChange.data,
                    tiles: dashboardChange.data.tiles.map((tile) => {
                        if (isChartTile(tile)) {
                            const [oldChartUuid, chart] = createdCharts.find(
                                ([uuid]) =>
                                    uuid === tile.properties.savedChartUuid,
                            )!;
                            return {
                                ...tile,
                                properties: {
                                    ...tile.properties,
                                    savedChartUuid: chart.uuid,
                                },
                            };
                        }
                        return tile;
                    }),
                },
            }),
        );

        return {
            ...promotionChanges,
            charts: {
                ...existingCharts,
                ...updatedCharts.map((chart) => ({
                    action: PromotionAction.UPDATE,
                    data: chart,
                })),
                ...createdCharts.map(([uuid, chart]) => ({
                    action: PromotionAction.CREATE,
                    data: chart,
                })),
            },
            dashboards: updatedDashboardsWithChartUuids,
        };
    }

    async promoteChart(user: SessionUser, chartUuid: string) {
        const { projectUuid } = await this.savedChartModel.getSummary(
            chartUuid,
        );

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (!upstreamProjectUuid) {
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );
        }
        const { promotedChart, upstreamChart } = await this.getPromoteCharts(
            user,
            upstreamProjectUuid,
            chartUuid,
        );
        try {
            PromoteService.checkPromoteChartPermissions(
                user,
                promotedChart,
                upstreamChart,
            );

            const updatedChart = await this.upsertChart(
                user,
                promotedChart,
                upstreamChart,
            );

            await this.trackAnalytics(
                user,
                'promote.executed',
                promotedChart,
                upstreamChart,
            );
            return updatedChart;
        } catch (e) {
            await this.trackAnalytics(
                user,
                'promote.error',
                promotedChart,
                upstreamChart,
                e.message,
            );
            throw e;
        }
    }

    private static getSpaceBySlug(
        spaces: PromotionChanges['spaces'],
        slug: string,
    ) {
        const space = spaces.find((s) => s.data.slug === slug);
        if (space === undefined) {
            throw new UnexpectedServerError(
                `Missing space with slug "${slug}" to promote`,
            );
        }
        return space.data;
    }

    private async getOrCreateDashboard(
        user: SessionUser,
        promotionChanges: PromotionChanges,
    ): Promise<PromotionChanges> {
        if (promotionChanges.dashboards.length !== 1) {
            throw new UnexpectedServerError(
                'Invalid dashboard changes to promote',
            );
        }
        const dashboardChange = promotionChanges.dashboards[0];

        if (dashboardChange.action !== PromotionAction.CREATE) {
            // If UPDATE or NO_CHANGES, we don't need to return the same dashboard
            return promotionChanges;
        }

        const promotedDashboard = dashboardChange.data;
        // Update dashboard with new space if it was created
        const dashboardSpace = PromoteService.getSpaceBySlug(
            promotionChanges.spaces,
            promotedDashboard.spaceSlug,
        );

        const newDashboard = await this.dashboardModel.create(
            dashboardSpace.uuid,
            {
                ...promotedDashboard,
                spaceUuid: dashboardSpace.uuid,
            },
            user,
            promotedDashboard.projectUuid,
        );

        return {
            ...promotionChanges,
            dashboards: [
                {
                    action: dashboardChange.action,
                    data: {
                        ...newDashboard,
                        spaceSlug: promotedDashboard.spaceSlug,
                    },
                },
            ],
        };
    }

    private async updateDashboard(
        user: SessionUser,
        promotionChanges: PromotionChanges,
    ): Promise<PromotionChanges> {
        if (promotionChanges.dashboards.length !== 1) return promotionChanges;

        // We assume there is only 1 dashboard to change,
        // Update this code if we introduce more than 1 dashboard change at a time
        const dahsboardChange = promotionChanges.dashboards[0];
        if (dahsboardChange.action === PromotionAction.NO_CHANGES) {
            return promotionChanges;
        }

        const promotedDashboard = dahsboardChange.data;
        const dashboardSpace = PromoteService.getSpaceBySlug(
            promotionChanges.spaces,
            promotedDashboard.spaceSlug,
        );

        if (dahsboardChange.action === PromotionAction.UPDATE) {
            // TODO Check if we need to update the dashboard
            // We also update dashboard name and description if they have changed
            await this.dashboardModel.update(promotedDashboard.uuid, {
                name: promotedDashboard.name,
                description: promotedDashboard.description,
                spaceUuid: dashboardSpace.uuid,
            });
        }

        const updatedDashboard = await this.dashboardModel.addVersion(
            promotedDashboard.uuid,
            promotedDashboard,
            user,
            promotedDashboard.projectUuid,
        );

        return {
            ...promotionChanges,
            dashboards: [
                {
                    action: dahsboardChange.action,
                    data: {
                        ...updatedDashboard,
                        spaceSlug: promotedDashboard.spaceSlug,
                    },
                },
            ],
        };
    }

    private async updateDashboard__(
        user: SessionUser,
        promotedContent: PromotedDashboard,
        upstreamContent: UpstreamDashboard,
    ) {
        const promotedDashboard = promotedContent.dashboard;
        if (upstreamContent.dashboard === undefined) {
            // Make sure you create the dashboard with `getOrCreateDashboard` and update `upstreamContent`
            // before calling this method
            throw new UnexpectedServerError(`Missing dashboard to promote`);
        }
        // If the dashboard was moved to another space, we might need to create it
        const space = await this.getOrCreateSpace(
            user,
            promotedContent,
            upstreamContent,
        );

        // We override existing dashboard details
        const upstreamDashboard = upstreamContent.dashboard;

        if (
            upstreamDashboard.name !== promotedDashboard.name ||
            upstreamDashboard.description !== promotedDashboard.description ||
            upstreamDashboard.spaceUuid !== space?.uuid
        ) {
            // We also update dashboard name and description if they have changed
            await this.dashboardModel.update(upstreamDashboard.uuid, {
                name: promotedDashboard.name,
                description: promotedDashboard.description,
                spaceUuid: space?.uuid,
            });
        }

        const updatedChart = await this.dashboardModel.addVersion(
            upstreamDashboard.uuid,
            promotedDashboard,
            user,
            upstreamContent.projectUuid,
        );

        return updatedChart;
    }

    async createNewSpaces(
        user: SessionUser,
        promotionChanges: PromotionChanges,
    ): Promise<PromotionChanges> {
        const spaceChanges = promotionChanges.spaces;
        // Creates the spaces needed and return a new list of spaces with the right uuids
        const existingSpaces = await spaceChanges.filter(
            (change) => change.action === PromotionAction.NO_CHANGES,
        );

        const newSpaces = spaceChanges
            .filter((change) => change.action === PromotionAction.CREATE)
            .map((spaceChange) => {
                const { data } = spaceChange;
                return this.spaceModel.createSpace(
                    data.projectUuid,
                    data.name,
                    user.userId,
                    data.isPrivate,
                    data.slug,
                );
            });
        const newSpaceSummaries = await Promise.all(newSpaces);
        const newSpaceChanges = newSpaceSummaries.map((space) => {
            const promotedSpace: PromotedSpace = {
                ...space,
                access: [],
                chartCount: 0,
                dashboardCount: 0,
            };
            return {
                action: PromotionAction.CREATE,
                data: promotedSpace,
            };
        });
        return {
            ...promotionChanges,
            spaces: [...existingSpaces, ...newSpaceChanges],
        };
    }

    async getPromotionDashboardChanges(
        user: SessionUser,
        promotedDashboard: PromotedDashboard,
        upstreamDashboard: UpstreamDashboard,
    ): Promise<
        [
            PromotionChanges,
            {
                promotedChart: PromotedChart;
                upstreamChart: UpstreamChart;
            }[],
        ]
    > {
        const upstreamProjectUuid = upstreamDashboard.projectUuid;

        const chartUuids = promotedDashboard.dashboard.tiles.reduce<string[]>(
            (acc, tile) => {
                if (isChartTile(tile) && tile.properties.savedChartUuid) {
                    return [...acc, tile.properties.savedChartUuid];
                }
                return acc;
            },
            [],
        );

        const chartPromises = chartUuids.map((chartUuid) =>
            this.getPromoteCharts(user, upstreamProjectUuid, chartUuid),
        );
        const charts = await Promise.all(chartPromises);

        const chartsAndDashboardSpaces = [
            {
                promotedSpace: upstreamDashboard.space,
                upstreamSpace: upstreamDashboard.space,
            },
            ...charts.map(({ promotedChart, upstreamChart }) => ({
                promotedSpace: promotedChart.space,
                upstreamSpace: upstreamChart.space,
            })),
        ];

        const spaceChanges = chartsAndDashboardSpaces.reduce<
            {
                action: PromotionAction;
                data: PromotedSpace;
            }[]
        >((acc, content) => {
            const { promotedSpace, upstreamSpace } = content;
            if (upstreamSpace !== undefined) {
                // TODO check differences to see if we need to UPDATE or NO_CHANGES
                // TODO update spaces if they have changed
                return [
                    ...acc,
                    {
                        action: PromotionAction.NO_CHANGES,
                        data: upstreamSpace,
                    },
                ];
            }
            if (promotedSpace === undefined) return acc; // This could be a chart within a dashboard, no need for space
            if (acc.some((space) => space.data.slug === promotedSpace.slug))
                return acc; // Space already exists

            return [
                ...acc,
                {
                    action: PromotionAction.CREATE,
                    data: {
                        ...promotedSpace,
                        projectUuid: upstreamProjectUuid,
                    },
                },
            ];
        }, []);

        const dashboardChanges: PromotionChanges['dashboards'] =
            upstreamDashboard.dashboard !== undefined
                ? [
                      {
                          // TODO check differences to see if we need to UPDATE or NO_CHANGES
                          action: PromotionAction.UPDATE,
                          data: {
                              ...promotedDashboard.dashboard,
                              ...upstreamDashboard.dashboard,
                              spaceSlug: promotedDashboard.space?.slug,
                          },
                      },
                  ]
                : [
                      {
                          action: PromotionAction.CREATE,
                          data: {
                              ...promotedDashboard.dashboard,
                              spaceUuid:
                                  upstreamDashboard.space?.uuid ||
                                  promotedDashboard.dashboard.spaceUuid, // Or set the new space uuid after creation
                              projectUuid: upstreamProjectUuid,
                              spaceSlug: promotedDashboard.space?.slug,
                          },
                      },
                  ];

        const chartChanges: PromotionChanges['charts'] = charts.map(
            ({ promotedChart, upstreamChart }) => {
                // TODO check differences to see if we need to UPDATE or NO_CHANGES

                if (upstreamChart.chart !== undefined) {
                    return {
                        action: PromotionAction.UPDATE,
                        data: {
                            ...promotedChart.chart,
                            ...upstreamChart.chart,
                            spaceSlug: promotedChart.space?.slug,
                        },
                    };
                }
                return {
                    action: PromotionAction.CREATE,
                    data: {
                        ...promotedChart.chart,
                        dashboardUuid:
                            upstreamDashboard.dashboard?.uuid ||
                            promotedChart.chart.dashboardUuid, // set the new space uuid after creation
                        spaceUuid:
                            upstreamChart.space?.uuid ||
                            promotedChart.space.uuid, // set the new space uuid after creation
                        projectUuid: upstreamProjectUuid,
                        spaceSlug: promotedChart.space?.slug,
                    },
                };
            },
        );

        return [
            {
                spaces: spaceChanges,
                dashboards: dashboardChanges,
                charts: chartChanges,
            },
            charts, // For permission checks
        ];
    }

    async getPromotedDashboard(
        user: SessionUser,
        dashboard: DashboardDAO,
        upstreamProjectUuid: string,
    ) {
        const promotedSpace = await this.spaceModel.getSpaceSummary(
            dashboard.spaceUuid,
        );

        const existingUpstreamDashboards = await this.dashboardModel.find({
            projectUuid: upstreamProjectUuid,
            slug: dashboard.slug,
        });
        if (existingUpstreamDashboards.length > 1) {
            throw new AlreadyExistsError(
                `There are multiple dashboards with the same identifier ${dashboard.slug}`,
            );
        }

        const upstreamSpaces = await this.spaceModel.find({
            projectUuid: upstreamProjectUuid,
            slug: promotedSpace.slug,
        });
        if (upstreamSpaces.length > 1) {
            throw new AlreadyExistsError(
                `There are multiple spaces with the same identifier ${promotedSpace.slug}`,
            );
        }

        const promotedDashboard: PromotedDashboard = {
            dashboard,
            projectUuid: dashboard.projectUuid,
            space: promotedSpace,
            access: await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                promotedSpace.uuid,
            ),
        };
        const upstreamSpace =
            upstreamSpaces.length === 1 ? upstreamSpaces[0] : undefined;
        const upstreamDashboard = {
            dashboard:
                existingUpstreamDashboards.length === 1
                    ? existingUpstreamDashboards[0]
                    : undefined,
            projectUuid: upstreamProjectUuid,
            space: upstreamSpace,
            access: upstreamSpace
                ? await this.spaceModel.getUserSpaceAccess(
                      user.userUuid,
                      upstreamSpace.uuid,
                  )
                : [],
        };

        return { promotedDashboard, upstreamDashboard };
    }

    async promoteDashboard(user: SessionUser, dashboardUuid: string) {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            dashboard.projectUuid,
        );
        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );

        const { promotedDashboard, upstreamDashboard } =
            await this.getPromotedDashboard(
                user,
                dashboard,
                upstreamProjectUuid,
            );

        // We're going to be updating this structure with new UUIDs if we need to create the items (eg: spaces)
        let promotedChanges: PromotionChanges;
        let promotedCharts: {
            promotedChart: PromotedChart;
            upstreamChart: UpstreamChart;
        }[];

        [promotedChanges, promotedCharts] =
            await this.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

        promotedCharts = [];

        try {
            PromoteService.checkPromoteDashboardPermissions(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

            // Check permissions for all chart tiles

            promotedCharts.forEach(({ promotedChart, upstreamChart }) =>
                PromoteService.checkPromoteChartPermissions(
                    user,
                    promotedChart,
                    upstreamChart,
                    promotedDashboard,
                ),
            );

            // at this point, all permisions checks are done, so we can safely promote the dashboard and charts.
            promotedChanges = await this.createNewSpaces(user, promotedChanges);

            // We first create the dashboard if needed, with empty tiles
            // Because we need the dashboardUuid to update the charts within the dashboard
            promotedChanges = await this.getOrCreateDashboard(
                user,
                promotedChanges,
            );

            // Update or create charts
            // and return the list of dashboard.tiles updates with the new chart uuids
            promotedChanges = await this.upsertCharts(user, promotedChanges);

            promotedChanges = await this.updateDashboard(user, promotedChanges);

            // Delete orphaned charts in dashboard if it already existed
            if (upstreamDashboard.dashboard) {
                const orphanedCharts =
                    await this.dashboardModel.getOrphanedCharts(
                        upstreamDashboard.dashboard.uuid,
                    );
                await Promise.all(
                    orphanedCharts.map((chart) =>
                        this.savedChartModel.delete(chart.uuid),
                    ),
                );
            }

            await this.trackAnalytics(
                user,
                'promote.executed',
                promotedDashboard,
                upstreamDashboard,
            );
            return promotedChanges.dashboards[0].data;
        } catch (e) {
            await this.trackAnalytics(
                user,
                'promote.error',
                promotedDashboard,
                upstreamDashboard,
                e.message,
            );
            throw e;
        }
    }
}
