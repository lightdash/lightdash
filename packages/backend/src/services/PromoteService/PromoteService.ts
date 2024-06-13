import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartSummary,
    DashboardDAO,
    deepEqual,
    ForbiddenError,
    isChartTile,
    NotFoundError,
    ParameterError,
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
import Logger from '../../logging/logger';
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
    chart: (ChartSummary & { updatedAt: Date }) | undefined;
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

    private static isSpaceUpdated(
        promotedSpace: Omit<SpaceSummary, 'userAccess'>,
        upstreamSpace: Omit<SpaceSummary, 'userAccess'>,
    ) {
        if (upstreamSpace === undefined) return true;
        return (
            promotedSpace?.name !== upstreamSpace.name ||
            promotedSpace?.isPrivate !== upstreamSpace.isPrivate
        );
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
                    }));
            });
        const updatedCharts = await Promise.all(updatedChartPromises);

        const createdChartPromises: Promise<PromotedChangeChart>[] =
            promotionChanges.charts
                .filter((change) => change.action === PromotionAction.CREATE)
                .map((chartChange) => {
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
                    return this.savedChartModel
                        .create(
                            changeChart.projectUuid,
                            user.userUuid,
                            chartData,
                        )
                        .then((chart) => ({
                            ...chart,
                            oldUuid: changeChart.oldUuid,
                            spaceSlug: changeChart.spaceSlug,
                        }));
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
                            isChartTile(tile) &&
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
            charts: {
                ...existingCharts,
                ...updatedCharts.map((chart) => ({
                    action: PromotionAction.UPDATE,
                    data: chart,
                })),
                ...createdCharts.map((chart) => ({
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

            let promotionChanges: PromotionChanges =
                PromoteService.getChartChanges(promotedChart, upstreamChart);

            promotionChanges = await this.upsertSpaces(user, promotionChanges);

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
                e.message,
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

        const promotionChanges: PromotionChanges =
            PromoteService.getChartChanges(promotedChart, upstreamChart);

        return promotionChanges;
    }

    async getPromoteDashboardDiff(user: SessionUser, dashboardUuid: string) {
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
        const [promotionChanges, promotedCharts] =
            await this.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

        return promotionChanges;
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
        const newDashboard = await this.dashboardModel.create(
            promotedDashboard.spaceUuid,
            promotedDashboard,
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
                    },
                },
            ],
        };
    }

    async upsertSpaces(
        user: SessionUser,
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
            this.spaceModel.update(spaceChange.data.uuid, spaceChange.data),
        );
        await Promise.all(updatedSpacePromises);

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
        const allSpaces = [
            ...existingSpaces,
            ...updatedSpaces,
            ...newSpaceChanges,
        ];

        const updateChartsWithSpace = promotionChanges.charts.map(
            (chartChange) => {
                const chart = chartChange.data;
                const space = PromoteService.getSpaceBySlug(
                    allSpaces,
                    chart.spaceSlug,
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
                const space = PromoteService.getSpaceBySlug(
                    allSpaces,
                    dashboard.spaceSlug,
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
                    oldUuid: promotedChart.chart.uuid,
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
                projectUuid: promotedChart.projectUuid,
                spaceSlug: promotedChart.space?.slug,
                oldUuid: promotedChart.chart.uuid,
            },
        };
    }

    static getSpaceChange(
        upstreamProjectUuid: string,
        promotedSpace: Omit<SpaceSummary, 'userAccess'>,
        upstreamSpace: Omit<SpaceSummary, 'userAccess'> | undefined,
    ): PromotionChanges['spaces'][number] {
        if (upstreamSpace !== undefined) {
            if (PromoteService.isSpaceUpdated(promotedSpace, upstreamSpace)) {
                return {
                    action: PromotionAction.UPDATE,
                    data: {
                        ...upstreamSpace,
                        name: promotedSpace.name,
                        isPrivate: promotedSpace.isPrivate, // This should always be false, until we allow promoting private content
                    },
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
                ...promotedSpace,
                projectUuid: upstreamProjectUuid,
            },
        };
    }

    static getChartChanges(
        promotedChart: PromotedChart,
        upstreamChart: UpstreamChart,
    ): PromotionChanges {
        const upstreamProjectUuid = promotedChart.projectUuid;
        const spaceChange = PromoteService.getSpaceChange(
            upstreamProjectUuid,
            promotedChart.space,
            upstreamChart.space,
        );

        const chartChange = PromoteService.getChartChange(
            promotedChart,
            upstreamChart,
        );

        return {
            spaces: [spaceChange],
            dashboards: [],
            charts: [chartChange],
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

            if (promotedSpace === undefined) return acc;
            if (acc.some((space) => space.data.slug === promotedSpace.slug))
                return acc; // Space already exists
            const spaceChange = PromoteService.getSpaceChange(
                upstreamProjectUuid,
                promotedSpace,
                upstreamSpace,
            );
            return [...acc, spaceChange];
        }, []);

        const dashboardChanges: PromotionChanges['dashboards'] = [
            upstreamDashboard,
        ].map((dashboard) => {
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
            promotionChanges = await this.upsertSpaces(user, promotionChanges);

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
                e.message,
            );
            throw e;
        }
    }
}
