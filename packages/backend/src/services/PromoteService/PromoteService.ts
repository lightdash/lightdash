import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartSummary,
    DashboardDAO,
    ForbiddenError,
    getDeepestPaths,
    getErrorMessage,
    isDashboardChartTileType,
    isSubPath,
    NotFoundError,
    ParameterError,
    PromotedChart as PromotedChangeChart,
    PromotedSpace,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    Space,
    SpaceShare,
    SpaceSummary,
    UnexpectedServerError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

export type PromotedChart = {
    projectUuid: string;
    chart: SavedChartDAO;
    space: PromotedSpace; // even if chart belongs to dashboard, this is not undefined
    spaces: PromotedSpace[];
    access: SpaceShare[];
};
export type UpstreamChart = {
    projectUuid: string;
    chart: (ChartSummary & { updatedAt: Date }) | undefined;
    space: PromotedSpace | undefined;
    access: SpaceShare[];
    dashboardUuid?: string; // dashboard uuid if chart belongs to dashboard
};
export type PromotedDashboard = {
    projectUuid: string;
    dashboard: DashboardDAO;
    space: PromotedSpace;
    spaces: PromotedSpace[];
    access: SpaceShare[];
};

export type UpstreamDashboard = {
    projectUuid: string;
    dashboard:
        | Pick<DashboardDAO, 'uuid' | 'name' | 'spaceUuid' | 'description'>
        | undefined;
    space: PromotedSpace | undefined;
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

const isChartWithinDashboard = (chart: Pick<SavedChartDAO, 'dashboardUuid'>) =>
    chart.dashboardUuid !== null;

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
                        ? promotedContent.dashboard.tiles.filter(
                              isDashboardChartTileType,
                          ).length
                        : undefined,
                error,
            },
        });
    }

    async getPromoteCharts(
        user: SessionUser,
        upstreamProjectUuid: string,
        chartUuid: string,
        includeOrphanChartsWithinDashboard?: boolean,
    ): Promise<{
        promotedChart: PromotedChart;
        upstreamChart: UpstreamChart;
    }> {
        const savedChart = await this.savedChartModel.get(chartUuid, undefined);

        const promotedSpace = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );

        const promotedSpaceAncestorUuids =
            await this.spaceModel.getSpaceAncestors({
                spaceUuid: savedChart.spaceUuid,
                projectUuid: savedChart.projectUuid,
            });

        const promotedSpaceAncestors =
            promotedSpaceAncestorUuids.length > 0
                ? await this.spaceModel.find({
                      spaceUuids: promotedSpaceAncestorUuids,
                  })
                : [];

        const upstreamCharts = await this.savedChartModel.find({
            projectUuid: upstreamProjectUuid,
            slug: savedChart.slug,
            includeOrphanChartsWithinDashboard,
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
            path: promotedSpace.path,
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
                spaces: promotedSpaceAncestors,
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
        upstreamContent: UpstreamChart | UpstreamDashboard,
    ) {
        const { organizationUuid } = user;
        if (upstreamContent.space) {
            // If upstreamContent has a matching space, we check if we have access
            if (
                user.ability.cannot(
                    'manage',
                    subject('Space', {
                        organizationUuid,
                        projectUuid: upstreamContent.projectUuid,
                        isPrivate: upstreamContent.space.isPrivate,
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

        PromoteService.checkPromoteSpacePermissions(user, upstreamChart);
    }

    static checkPromoteDashboardPermissions(
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
        PromoteService.checkPromoteSpacePermissions(user, upstreamDashboard);
    }

    private static isSpaceUpdated(
        promotedSpace: Pick<SpaceSummary, 'name'>,
        upstreamSpace: Pick<SpaceSummary, 'name'>,
    ) {
        return promotedSpace.name !== upstreamSpace.name;
    }

    private static isDashboardUpdated(
        promotedDashboard: DashboardDAO,
        upstreamDashboard: UpstreamDashboard['dashboard'],
    ) {
        // Dashboard table don't have last_version_updated_at or tiles to compare
        // We need to fecth more data to check if the dashboard requires an update
        // Right now we assume it is always needed
        return true;
    }

    private static isChartUpdated(
        promotedChart: SavedChartDAO,
        upstreamChart: UpstreamChart['chart'],
    ) {
        // We only check if the promotedChart.updated At is more recent than the upstreamChart.updatedAt
        // This is not very accurate, and can lead to some confusion if people start updating the same chart in both projects
        // But to make this more accurate we would need to fetch all the metricQuery and chart config and check if they are the same
        // Or introduce a versionHash on update in the chart

        if (upstreamChart === undefined) return true;

        return (
            promotedChart.updatedAt > upstreamChart.updatedAt ||
            promotedChart.name !== upstreamChart.name ||
            promotedChart.description !== upstreamChart.description
        );
    }

    async upsertCharts(
        user: SessionUser,
        promotionChanges: PromotionChanges,
        promotedDashboardUuid?: string, // dashboard uuid if chart belongs to dashboard
    ): Promise<PromotionChanges> {
        const { charts } = promotionChanges;

        const existingCharts = charts.filter(
            (change) => change.action === PromotionAction.NO_CHANGES,
        );

        await Promise.all(
            charts
                .filter((change) => change.action === PromotionAction.UPDATE)
                .map((chartChange) => {
                    const changeChart = chartChange.data;
                    // We also update chart name and description if they have changed
                    return this.savedChartModel.update(changeChart.uuid, {
                        name: changeChart.name,
                        description: changeChart.description,
                        spaceUuid: isChartWithinDashboard(changeChart)
                            ? undefined
                            : changeChart.spaceUuid,
                    });
                }),
        );

        const updatedChartPromises = charts
            .filter((change) => change.action === PromotionAction.UPDATE)
            .map((chartChange) => {
                const changeChart = chartChange.data;

                const chartData =
                    isChartWithinDashboard(changeChart) && promotedDashboardUuid
                        ? {
                              ...changeChart,
                              dashboardUuid: promotedDashboardUuid,
                              spaceUuid: null,
                              updatedByUser: user,
                              slug: changeChart.slug,
                          }
                        : {
                              ...changeChart,
                              dashboardUuid: null,
                              spaceUuid: changeChart.spaceUuid,
                              updatedByUser: user,
                              slug: changeChart.slug,
                          };
                return this.savedChartModel
                    .createVersion(changeChart.uuid, chartData, user)
                    .then((updatedChart) => ({
                        ...updatedChart,
                        oldUuid: changeChart.oldUuid,
                        spaceSlug: changeChart.spaceSlug,
                        spacePath: changeChart.spacePath,
                    }));
            });
        const updatedCharts = await Promise.all(updatedChartPromises);

        const createdChartPromises: Promise<PromotedChangeChart>[] =
            promotionChanges.charts
                .filter((change) => change.action === PromotionAction.CREATE)
                .map(async (chartChange) => {
                    const changeChart = chartChange.data;

                    // Update dashboard with new space if it was created
                    // For charts created within dashboard, we point to the new created dashboard

                    const chartData =
                        isChartWithinDashboard(changeChart) &&
                        promotedDashboardUuid
                            ? {
                                  ...changeChart,
                                  dashboardUuid: promotedDashboardUuid,
                                  spaceUuid: null,
                                  updatedByUser: user,
                                  slug: changeChart.slug,
                              }
                            : {
                                  ...changeChart,
                                  dashboardUuid: null,
                                  spaceUuid: changeChart.spaceUuid,
                                  updatedByUser: user,
                                  slug: changeChart.slug,
                              };
                    const createdChart = await this.savedChartModel.create(
                        changeChart.projectUuid,
                        user.userUuid,
                        {
                            ...chartData,
                            forceSlug: true,
                        },
                    );

                    return {
                        ...createdChart,
                        oldUuid: changeChart.oldUuid,
                        spaceSlug: changeChart.spaceSlug,
                        spacePath: changeChart.spacePath,
                    };
                });
        const createdCharts = await Promise.all(createdChartPromises);

        const allCharts: PromotedChangeChart[] = [
            ...existingCharts.map((ec) => ec.data),
            ...updatedCharts,
            ...createdCharts,
        ];
        const getChartByOldUuid = (oldUuid: string) => {
            const chart = allCharts.find((c) => c.oldUuid === oldUuid);
            if (chart === undefined)
                throw new UnexpectedServerError(
                    `Missing chart with old uuid "${oldUuid}" to promote`,
                );
            return chart;
        };
        // We update the dashboard tiles with the chart uuids we've just insterted
        const updatedDashboardsWithChartUuids = promotionChanges.dashboards.map(
            (dashboardChange) => ({
                ...dashboardChange,
                data: {
                    ...dashboardChange.data,
                    tiles: dashboardChange.data.tiles.map((tile) => {
                        if (
                            isDashboardChartTileType(tile) &&
                            tile.properties.savedChartUuid
                        ) {
                            const newTileChart = getChartByOldUuid(
                                tile.properties.savedChartUuid,
                            );

                            return {
                                ...tile,
                                properties: {
                                    ...tile.properties,
                                    savedChartUuid: newTileChart.uuid,
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
            charts: [
                ...existingCharts,
                ...updatedCharts.map((chart) => ({
                    action: PromotionAction.UPDATE,
                    data: chart,
                })),
                ...createdCharts.map((chart) => ({
                    action: PromotionAction.CREATE,
                    data: chart,
                })),
            ],
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

        if (isChartWithinDashboard(promotedChart.chart)) {
            throw new ParameterError(
                'Promoting charts within dashboards is not supported',
            );
        }
        try {
            PromoteService.checkPromoteChartPermissions(
                user,
                promotedChart,
                upstreamChart,
            );

            let promotionChanges: PromotionChanges = await this.getChartChanges(
                promotedChart,
                upstreamChart,
            );

            promotionChanges = await this.upsertSpaces(
                user,
                projectUuid,
                promotionChanges,
            );

            promotionChanges = await this.upsertCharts(user, promotionChanges);

            await this.trackAnalytics(
                user,
                'promote.executed',
                promotedChart,
                upstreamChart,
            );
            return promotionChanges.charts[0].data;
        } catch (e) {
            Logger.error(`Unable to promote chart`, e);
            await this.trackAnalytics(
                user,
                'promote.error',
                promotedChart,
                upstreamChart,
                getErrorMessage(e),
            );
            throw e;
        }
    }

    async getPromoteChartDiff(user: SessionUser, chartUuid: string) {
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

        const promotionChanges = await this.getChartChanges(
            promotedChart,
            upstreamChart,
        );

        return {
            ...promotionChanges,
            spaces: PromoteService.sortSpaceChanges(promotionChanges.spaces),
        };
    }

    async getPromoteDashboardDiff(user: SessionUser, dashboardUuid: string) {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );

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
        const [promotionChanges, promotedCharts] =
            await this.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

        return {
            ...promotionChanges,
            spaces: PromoteService.sortSpaceChanges(promotionChanges.spaces),
        };
    }

    private static getSpaceByPath(
        spaces: PromotionChanges['spaces'],
        path: string,
    ) {
        const space = spaces.find((s) => s.data.path === path);
        if (space === undefined) {
            throw new UnexpectedServerError(
                `Missing space with path "${path}" to promote`,
            );
        }
        return space.data;
    }

    async getOrCreateDashboard(
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
        const newDashboard = await this.dashboardModel.create(
            promotedDashboard.spaceUuid,
            {
                ...promotedDashboard,
                forceSlug: true,
            },
            user,
            promotedDashboard.projectUuid,
        );

        // Update charts within dashboards with the new dashboard uuid
        const updatedCharts = promotionChanges.charts.map((chartChange) => {
            if (chartChange.data.dashboardUuid) {
                return {
                    ...chartChange,
                    data: {
                        ...chartChange.data,
                        dashboardUuid: newDashboard.uuid,
                    },
                };
            }
            return chartChange;
        });

        return {
            ...promotionChanges,
            dashboards: [
                {
                    action: dashboardChange.action,
                    data: {
                        ...newDashboard,
                        spaceSlug: promotedDashboard.spaceSlug,
                        spacePath: promotedDashboard.spacePath,
                    },
                },
            ],
            charts: updatedCharts,
        };
    }

    async updateDashboard(
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

        if (dahsboardChange.action === PromotionAction.UPDATE) {
            // TODO Check if we need to update the dashboard
            // We also update dashboard name and description if they have changed
            await this.dashboardModel.update(promotedDashboard.uuid, {
                name: promotedDashboard.name,
                description: promotedDashboard.description,
                spaceUuid: promotedDashboard.spaceUuid,
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
                        spacePath: promotedDashboard.spacePath,
                    },
                },
            ],
        };
    }

    async upsertSpaces(
        user: SessionUser,
        projectUuid: string, // The base project uuid
        promotionChanges: PromotionChanges,
    ): Promise<PromotionChanges> {
        const spaceChanges = promotionChanges.spaces;

        // Creates the spaces needed and return a new list of spaces with the right uuids
        const existingSpaces = spaceChanges.filter(
            (change) => change.action === PromotionAction.NO_CHANGES,
        );

        const updatedSpaces = spaceChanges.filter(
            (change) => change.action === PromotionAction.UPDATE,
        );
        const updatedSpacePromises = updatedSpaces.map((spaceChange) =>
            // Only update name, promotion should not change permissions
            this.spaceModel.update(spaceChange.data.uuid, {
                name: spaceChange.data.name,
            }),
        );
        await Promise.all(updatedSpacePromises);

        const paths = spaceChanges
            .filter((change) => change.action === PromotionAction.CREATE)
            .map((change) => change.data.path);
        const deepestPaths = getDeepestPaths(paths);

        const newSpaces = new Map<string, Space>();

        for await (const deepestPath of deepestPaths) {
            const filteredSortedSpaceChanges = spaceChanges
                .filter((change) => change.action === PromotionAction.CREATE)
                .filter(
                    (change) =>
                        change.data.path === deepestPath ||
                        isSubPath(change.data.path, deepestPath),
                )
                // Sort by path length to create the parent spaces first
                .sort(
                    (a, b) =>
                        a.data.path.split('.').length -
                        b.data.path.split('.').length,
                );

            let parentSpaceUuid: string | null = null;
            if (filteredSortedSpaceChanges.length > 0) {
                // parentSpaceUuid of promoted space in downstream project
                const promotedParentSpaceChangesData =
                    filteredSortedSpaceChanges[0].data;

                if (promotedParentSpaceChangesData.parentSpaceUuid) {
                    const promotedParentSpace =
                        await this.spaceModel.getSpaceSummary(
                            promotedParentSpaceChangesData.parentSpaceUuid,
                        );

                    const parentSpace = await this.spaceModel.find({
                        path: promotedParentSpace.path,
                        projectUuid: promotedParentSpaceChangesData.projectUuid, // this is correctly set in `getSpaceChange`
                    });

                    if (parentSpace.length !== 1) {
                        throw new UnexpectedServerError(
                            `Expected 1 parent space for ${promotedParentSpace.path}, got ${parentSpace.length}`,
                        );
                    }

                    parentSpaceUuid = parentSpace[0].uuid;
                }
            }

            for await (const spaceChange of filteredSortedSpaceChanges) {
                if (newSpaces.has(spaceChange.data.path)) {
                    parentSpaceUuid = newSpaces.get(
                        spaceChange.data.path,
                    )!.uuid;

                    // eslint-disable-next-line no-continue
                    continue;
                }

                const { data } = spaceChange;

                const space = await this.spaceModel.createSpace(
                    {
                        isPrivate: data.isPrivate,
                        name: data.name,
                        parentSpaceUuid,
                    },
                    {
                        projectUuid: data.projectUuid,
                        userId: user.userId,
                        path: data.path,
                    },
                );
                parentSpaceUuid = space.uuid;

                if (data.isPrivate) {
                    const promotedSpaceWithAccess =
                        await this.spaceModel.getFullSpace(data.uuid);

                    const userAccessPromises = promotedSpaceWithAccess.access
                        .filter((access) => access.hasDirectAccess)
                        .map((userAccess) =>
                            this.spaceModel.addSpaceAccess(
                                space.uuid,
                                userAccess.userUuid,
                                userAccess.role,
                            ),
                        );

                    const groupAccessPromises =
                        promotedSpaceWithAccess.groupsAccess.map(
                            (groupAccess) =>
                                this.spaceModel.addSpaceGroupAccess(
                                    space.uuid,
                                    groupAccess.groupUuid,
                                    groupAccess.spaceRole,
                                ),
                        );

                    await Promise.all([
                        ...userAccessPromises,
                        ...groupAccessPromises,
                    ]);
                }

                newSpaces.set(space.path, space);
            }
        }

        const newSpaceChanges = Array.from(newSpaces.values()).map((space) => {
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
        const allSpaces = [
            ...existingSpaces,
            ...updatedSpaces,
            ...newSpaceChanges,
        ];

        const updateChartsWithSpace = promotionChanges.charts.map(
            (chartChange) => {
                const chart = chartChange.data;
                const space = PromoteService.getSpaceByPath(
                    allSpaces,
                    chart.spacePath,
                );
                return {
                    ...chartChange,
                    data: {
                        ...chart,
                        spaceUuid: space.uuid,
                    },
                };
            },
        );
        const updateDashboardWithSpace = promotionChanges.dashboards.map(
            (dashboardChange) => {
                const dashboard = dashboardChange.data;
                const space = PromoteService.getSpaceByPath(
                    allSpaces,
                    dashboard.spacePath,
                );
                return {
                    ...dashboardChange,
                    data: {
                        ...dashboard,
                        spaceUuid: space.uuid,
                    },
                };
            },
        );

        return {
            spaces: allSpaces,
            dashboards: updateDashboardWithSpace,
            charts: updateChartsWithSpace,
        };
    }

    static getChartChange(
        promotedChart: PromotedChart,
        upstreamChart: UpstreamChart,
    ): PromotionChanges['charts'][number] {
        if (upstreamChart.chart !== undefined) {
            return {
                action: PromoteService.isChartUpdated(
                    promotedChart.chart,
                    upstreamChart.chart,
                )
                    ? PromotionAction.UPDATE
                    : PromotionAction.NO_CHANGES,
                data: {
                    ...promotedChart.chart,
                    dashboardUuid: promotedChart.chart.dashboardUuid, // change the dashboard uuid after creation
                    spaceUuid: upstreamChart.chart.spaceUuid,
                    uuid: upstreamChart.chart.uuid,
                    spaceSlug: promotedChart.space?.slug,
                    spacePath: promotedChart.space?.path,
                    oldUuid: promotedChart.chart.uuid,
                    projectUuid: upstreamChart.projectUuid,
                },
            };
        }
        return {
            action: PromotionAction.CREATE,
            data: {
                ...promotedChart.chart,
                dashboardUuid:
                    upstreamChart.dashboardUuid ||
                    promotedChart.chart.dashboardUuid, // set the new space uuid after creation
                spaceUuid:
                    upstreamChart.space?.uuid || promotedChart.space.uuid, // set the new space uuid after creation
                projectUuid: upstreamChart.projectUuid,
                spaceSlug: promotedChart.space?.slug,
                spacePath: promotedChart.space?.path,
                oldUuid: promotedChart.chart.uuid,
            },
        };
    }

    private async getSpaceChange(
        upstreamProjectUuid: string,
        promotedSpace: PromotedSpace,
    ): Promise<PromotionChanges['spaces'][number]> {
        const upstreamSpaceQueryResults = await this.spaceModel.find({
            path: promotedSpace.path,
            projectUuid: upstreamProjectUuid,
        });
        if (upstreamSpaceQueryResults.length > 1) {
            throw new UnexpectedServerError(
                `Expected 0 or 1 upstream space for ${promotedSpace.path}, got ${upstreamSpaceQueryResults.length}`,
            );
        }

        const upstreamSpace =
            upstreamSpaceQueryResults.length === 1
                ? upstreamSpaceQueryResults[0]
                : undefined;

        if (upstreamSpace !== undefined) {
            if (PromoteService.isSpaceUpdated(promotedSpace, upstreamSpace)) {
                return {
                    action: PromotionAction.UPDATE,
                    data: {
                        ...upstreamSpace,
                        name: promotedSpace.name,
                    },

                    // TODO: implement path change and call SpaceService.move
                };
            }
            return {
                action: PromotionAction.NO_CHANGES,
                data: upstreamSpace,
            };
        }

        return {
            action: PromotionAction.CREATE,
            data: {
                // slug in the upstream project can already exist.
                ...promotedSpace,
                projectUuid: upstreamProjectUuid,
            },
        };
    }

    static sortSpaceChanges(
        spaceChanges: PromotionChanges['spaces'],
    ): PromotionChanges['spaces'] {
        return spaceChanges.sort(
            (a, b) =>
                a.data.path.split('.').length - b.data.path.split('.').length,
        );
    }

    async getChartChanges(
        promotedChart: PromotedChart,
        upstreamChart: UpstreamChart,
    ): Promise<PromotionChanges> {
        const chartChange = PromoteService.getChartChange(
            promotedChart,
            upstreamChart,
        );

        const spaceChange = await this.getSpaceChange(
            upstreamChart.projectUuid,
            promotedChart.space,
        );

        if (chartChange.action === PromotionAction.NO_CHANGES) {
            return {
                spaces: [spaceChange],
                dashboards: [],
                charts: [chartChange],
            };
        }

        const spaceChanges = await Promise.all(
            promotedChart.spaces.map((space) =>
                this.getSpaceChange(upstreamChart.projectUuid, space),
            ),
        );

        return {
            spaces: [spaceChange, ...spaceChanges],
            dashboards: [],
            charts: [chartChange],
        };
    }

    async getPromotionDashboardChanges(
        user: SessionUser,
        promotedDashboard: PromotedDashboard,
        upstreamDashboard: UpstreamDashboard,
        includeOrphanChartsWithinDashboard?: boolean,
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
                if (
                    isDashboardChartTileType(tile) &&
                    tile.properties.savedChartUuid
                ) {
                    return [...acc, tile.properties.savedChartUuid];
                }
                return acc;
            },
            [],
        );

        const chartPromises = chartUuids.map((chartUuid) =>
            this.getPromoteCharts(
                user,
                upstreamProjectUuid,
                chartUuid,
                includeOrphanChartsWithinDashboard,
            ),
        );
        const charts = await Promise.all(chartPromises);

        const chartsAndDashboardSpaces = [
            {
                promotedSpace: promotedDashboard.space,
                upstreamSpace: upstreamDashboard.space,
            },
            ...promotedDashboard.spaces.map((space) => ({
                promotedSpace: space,
                upstreamSpace: undefined,
            })),
            ...charts.flatMap(({ promotedChart, upstreamChart }) => [
                {
                    promotedSpace: promotedChart.space,
                    upstreamSpace: upstreamChart.space,
                },
                ...promotedChart.spaces.map((space) => ({
                    promotedSpace: space,
                    upstreamSpace: undefined,
                })),
            ]),
        ];

        const spaceChanges: {
            action: PromotionAction;
            data: PromotedSpace;
        }[] = [];

        for await (const content of chartsAndDashboardSpaces) {
            // TODO: check if upstreamSpace is necessary elsewhere
            const { promotedSpace, upstreamSpace } = content;

            // eslint-disable-next-line no-continue
            if (promotedSpace === undefined) continue;

            // checks if Space already exists in the spaceChanges
            if (
                spaceChanges.some(
                    (space) => space.data.path === promotedSpace.path,
                )
            ) {
                // eslint-disable-next-line no-continue
                continue;
            }

            const spaceChange = await this.getSpaceChange(
                upstreamProjectUuid,
                promotedSpace,
            );

            spaceChanges.push(spaceChange);
        }

        const dashboardChanges: PromotionChanges['dashboards'] = [
            upstreamDashboard,
        ].map(() => {
            if (upstreamDashboard.dashboard !== undefined) {
                return {
                    action: PromoteService.isDashboardUpdated(
                        promotedDashboard.dashboard,
                        upstreamDashboard.dashboard,
                    )
                        ? PromotionAction.UPDATE
                        : PromotionAction.NO_CHANGES,
                    data: {
                        ...promotedDashboard.dashboard,
                        uuid: upstreamDashboard.dashboard.uuid,
                        spaceUuid: upstreamDashboard.dashboard.spaceUuid,
                        spaceSlug: promotedDashboard.space?.slug,
                        spacePath: promotedDashboard.space?.path,
                        projectUuid: upstreamProjectUuid,
                    },
                };
            }
            return {
                action: PromotionAction.CREATE,
                data: {
                    ...promotedDashboard.dashboard,
                    spaceUuid:
                        upstreamDashboard.space?.uuid ||
                        promotedDashboard.dashboard.spaceUuid, // Or set the new space uuid after creation
                    projectUuid: upstreamProjectUuid,
                    spaceSlug: promotedDashboard.space?.slug,
                    spacePath: promotedDashboard.space?.path,
                },
            };
        });

        const chartChanges: PromotionChanges['charts'] = charts.map(
            ({ promotedChart, upstreamChart }) =>
                PromoteService.getChartChange(promotedChart, upstreamChart),
        );

        // TODO return charts within dashboards that are going to be deleted after the promotion
        // For this we'll need to get all the tiles for the upstreamDashboard and compare against the promotedDashboard.tiles

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
    ): Promise<{
        promotedDashboard: PromotedDashboard;
        upstreamDashboard: UpstreamDashboard;
    }> {
        const promotedSpace = await this.spaceModel.getSpaceSummary(
            dashboard.spaceUuid,
        );

        const promotedSpaceAncestorUuids =
            await this.spaceModel.getSpaceAncestors({
                spaceUuid: dashboard.spaceUuid,
                projectUuid: dashboard.projectUuid,
            });

        const promotedSpaceAncestors =
            promotedSpaceAncestorUuids.length > 0
                ? await this.spaceModel.find({
                      spaceUuids: promotedSpaceAncestorUuids,
                  })
                : [];

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
            path: promotedSpace.path,
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
            spaces: promotedSpaceAncestors,
            access: await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                promotedSpace.uuid,
            ),
        };
        const upstreamSpace =
            upstreamSpaces.length === 1 ? upstreamSpaces[0] : undefined;

        const upstreamDashboard: UpstreamDashboard = {
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
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
        );

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
        // eslint-disable-next-line prefer-const
        let [promotionChanges, promotedCharts] =
            await this.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

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
            // And return the list of dashboards and charts with the new space
            promotionChanges = await this.upsertSpaces(
                user,
                dashboard.projectUuid,
                promotionChanges,
            );

            // We first create the dashboard if needed, with empty tiles
            // Because we need the dashboardUuid to update the charts within the dashboard
            promotionChanges = await this.getOrCreateDashboard(
                user,
                promotionChanges,
            );

            // Update or create charts
            // and return the list of dashboard.tiles updates with the new chart uuids
            promotionChanges = await this.upsertCharts(
                user,
                promotionChanges,
                promotionChanges.dashboards[0].data.uuid,
            );

            promotionChanges = await this.updateDashboard(
                user,
                promotionChanges,
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
            return promotionChanges.dashboards[0].data;
        } catch (e) {
            Logger.error(`Unable to promote dashboard`, e);
            await this.trackAnalytics(
                user,
                'promote.error',
                promotedDashboard,
                upstreamDashboard,
                getErrorMessage(e),
            );
            throw e;
        }
    }
}
