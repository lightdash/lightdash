import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartSummary,
    CreateDashboard,
    DashboardDAO,
    ForbiddenError,
    isChartTile,
    NotFoundError,
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
    space: Omit<SpaceSummary, 'userAccess'> | undefined; // undefined if chart belongs to dashboard
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

    private async getOrCreateDashboard(
        user: SessionUser,
        promotedContent: PromotedDashboard,
        upstreamContent: UpstreamDashboard,
    ) {
        // If the dashboard already exists, we return it
        if (upstreamContent.dashboard !== undefined) {
            return upstreamContent.dashboard;
        }
        // If the dashboard doesn't exist in the upstream project, we create with no tiles (we will populate later)

        const space = await this.getOrCreateSpace(
            user,
            promotedContent,
            upstreamContent,
        );
        // Create new dashboard
        const newDashboardData: CreateDashboard & {
            slug: string;
        } = {
            ...promotedContent.dashboard,
            spaceUuid: space.uuid,
            slug: promotedContent.dashboard.slug,
        };
        const newDashboard = await this.dashboardModel.create(
            space.uuid,
            newDashboardData,
            user,
            upstreamContent.projectUuid,
        );

        return newDashboard;
    }

    private async updateDashboard(
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
            upstreamDashboard.spaceUuid !== upstreamContent.space?.uuid
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

    async promoteDashboard(user: SessionUser, dashboardUuid: string) {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            dashboard.projectUuid,
        );
        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );

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
        const chartUuids = dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (isChartTile(tile) && tile.properties.savedChartUuid) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);
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

        try {
            PromoteService.checkPromoteDashboardPermissions(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

            // Check permissions for all chart tiles

            const chartPromises = chartUuids.map((chartUuid) =>
                this.getPromoteCharts(user, upstreamProjectUuid, chartUuid),
            );
            const charts = await Promise.all(chartPromises);

            charts.forEach(({ promotedChart, upstreamChart }) =>
                PromoteService.checkPromoteChartPermissions(
                    user,
                    promotedChart,
                    upstreamChart,
                    promotedDashboard,
                ),
            );

            // at this point, all permisions checks are done, so we can safely promote the dashboard and charts.

            // We first create the dashboard if needed, with empty tiles
            // Because we need the dashboardUuid to update the charts within the dashboard
            const createdDashboard = await this.getOrCreateDashboard(
                user,
                promotedDashboard,
                upstreamDashboard,
            );
            // Upserting all charts
            // This should not cause any permission issues, as we have already checked them
            // But if this fails somehow, we should return a partial success response
            const upsertChartPromises: Promise<[string, SavedChartDAO]>[] =
                charts.map(({ promotedChart, upstreamChart }) => {
                    // For charts created within dashboard, we point to the new created dashboard
                    const isChartWithinDashboard =
                        (upstreamChart.chart?.dashboardUuid ||
                            promotedChart.chart.dashboardUuid) !== null;
                    const updatedChartWithDashboard: UpstreamChart = {
                        ...upstreamChart,
                        dashboardUuid: isChartWithinDashboard // is chart within dashboard
                            ? createdDashboard.uuid
                            : undefined,
                    };
                    return this.upsertChart(
                        user,
                        promotedChart,
                        updatedChartWithDashboard,
                    ).then((upsertedChart) => [
                        promotedChart.chart.uuid,
                        upsertedChart,
                    ]);
                });
            // We update the dashboard tiles with the chart uuids we've just insterted
            const upsertedCharts = await Promise.all(upsertChartPromises);
            const updatedTiles = dashboard.tiles.map((tile) => {
                if (isChartTile(tile)) {
                    const [p, upsertedChart] = upsertedCharts.find(
                        ([promotedChartUuid]) =>
                            promotedChartUuid ===
                            tile.properties.savedChartUuid,
                    )!;
                    return {
                        ...tile,
                        properties: {
                            ...tile.properties,
                            savedChartUuid: upsertedChart.uuid,
                        },
                    };
                }
                return tile;
            });

            const updatedDashboard = await this.updateDashboard(
                user,
                {
                    ...promotedDashboard,
                    dashboard: {
                        ...promotedDashboard.dashboard,
                        tiles: updatedTiles,
                    },
                },
                {
                    ...upstreamDashboard,
                    dashboard: createdDashboard,
                },
            );

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
            return updatedDashboard;
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
