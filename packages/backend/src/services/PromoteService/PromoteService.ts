import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartSummary,
    CreateDashboard,
    DashboardDAO,
    isChartTile,
    NotFoundError,
    SavedChartDAO,
    SessionUser,
    SpaceShare,
    SpaceSummary,
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
    space: Omit<SpaceSummary, 'userAccess'>;
    access: SpaceShare[];
};
type UpstreamChart = {
    projectUuid: string;
    chart: ChartSummary | undefined;
    space: Omit<SpaceSummary, 'userAccess'> | undefined;
    access: SpaceShare[];
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
    /*
    private checkPermissions = async ({
        user,
        subjectType,
        organizationUuid,
        projectUuid,
        space,
        context,
        fromProjectUuid,
        toProjectUuid,
        chartUuid,
        dashboardUuid,
    }: {
        user: SessionUser;
        subjectType: 'SavedChart' | 'Dashboard';
        organizationUuid: string;
        projectUuid: string;
        space: Omit<SpaceSummary, 'userAccess'> | undefined;
        context: string;
        fromProjectUuid: string; // for analytics
        toProjectUuid?: string; // for analytics
        chartUuid?: string;
        dashboardUuid?: string;
    }) => {
        // If space is undefined, we only check the org/project access, we will create the chart/dashboard in a new accessible space
        const userDontHaveAccess = space
            ? user.ability.cannot(
                  'promote',
                  subject(subjectType, {
                      organizationUuid,
                      projectUuid,
                      isPrivate: space.isPrivate,
                      access: await this.spaceModel.getUserSpaceAccess(
                          user.userUuid,
                          space.uuid,
                      ),
                  }),
              )
            : user.ability.cannot(
                  'promote',
                  subject(subjectType, {
                      organizationUuid,
                      projectUuid,
                  }),
              ) ||
              user.ability.cannot(
                  'create',
                  subject('Space', { organizationUuid, projectUuid }),
              );

        if (userDontHaveAccess) {
            this.analytics.track({
                event: 'promote.error',
                userId: user.userUuid,
                properties: {
                    chartId: chartUuid,
                    dashboardId: dashboardUuid,
                    fromProjectId: fromProjectUuid,
                    toProjectId: toProjectUuid,
                    organizationId: organizationUuid,
                    error: `Permission error on ${context}`,
                },
            });

            throw new ForbiddenError(
                `You don't have the right access permissions on ${context} to promote.`,
            );
        }
    };       
  */

    async getPromoteCharts(
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

    // eslint-disable-next-line class-methods-use-this
    checkPromoteChartPermissions(
        user: SessionUser,
        promoteChart: PromotedChart,
        upstreamChart: UpstreamChart,
    ) {
        // Check permissions on `from project`
        // Check permissions on `upstream project`
    }

    // eslint-disable-next-line class-methods-use-this
    checkPromoteDashboardPermissions(
        user: SessionUser,
        promotedDashboard: PromotedDashboard,
        upstreamDashboard: UpstreamDashboard,
    ) {
        // Check permissions on `from project`
        // Check permissions on `upstream project`
    }

    async getOrCreateSpace(
        user: SessionUser,
        projectUuid: string,
        space: {
            projectUuid: string;
            name: string;
            userId: number;
            isPrivate: boolean;
            slug: string;
        },
    ): Promise<{ uuid: string; isNew: boolean }> {
        const existingSpace = await this.spaceModel.find({
            projectUuid,
            slug: space.slug,
        });
        if (existingSpace.length === 0) {
            // We have 0 or more than 1 space with the same slug
            /*  await this.checkPermissions({
                user,
                subjectType: 'SavedChart',
                organizationUuid,
                projectUuid: upstreamProjectUuid,
                space: undefined,
                context: 'the upstream project',
                fromProjectUuid: fromProjectUuid,
                toProjectUuid: upstreamProjectUuid,
            }); */

            // We create a new space
            const newSpace = await this.spaceModel.createSpace(
                projectUuid,
                space.name,
                user.userId,
                space.isPrivate,
                space.slug,
            );
            return { uuid: newSpace.uuid, isNew: true };
        }
        if (existingSpace.length === 1) {
            // We have an existing space with the same slug
            /*  await this.checkPermissions({
                user,
                subjectType: 'SavedChart',
                organizationUuid,
                projectUuid: upstreamProjectUuid,
                space: existingSpace[0],
                context: 'the upstream space and project',
                fromProjectUuid: fromProjectUuid,
                toProjectUuid: upstreamProjectUuid,
            }); */

            return { uuid: existingSpace[0].uuid, isNew: false };
        }
        // Multiple spaces with the same slug
        throw new AlreadyExistsError(
            `There are multiple spaces with the same identifier ${space.slug}`,
        );
    }

    async upsertChart(
        user: SessionUser,
        promotedContent: PromotedChart,
        upstreamContent: UpstreamChart,
    ) {
        const upstreamChart = upstreamContent.chart;
        const promotedChart = promotedContent.chart;
        if (upstreamChart === undefined) {
            // Create chart
            if (promotedChart?.dashboardUuid) {
                // Create chat in dashboard
                return this.savedChartModel.create(
                    upstreamContent.projectUuid,
                    user.userUuid,
                    {
                        ...promotedChart,
                        dashboardUuid: promotedChart.dashboardUuid,
                        spaceUuid: undefined,
                        updatedByUser: user,
                        slug: promotedChart.slug,
                    },
                );
            }

            // Create chart in space
            const space = await this.getOrCreateSpace(
                user,
                upstreamContent.projectUuid,
                {
                    name: promotedContent.space.name,
                    isPrivate: promotedContent.space.isPrivate || false,
                    projectUuid: promotedContent.projectUuid,
                    slug: promotedContent.space.slug,
                    userId: user.userId,
                },
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
            upstreamChart.description !== promotedChart.description
        ) {
            // We also update chart name and description if they have changed
            await this.savedChartModel.update(upstreamChart.uuid, {
                name: promotedChart.name,
                description: promotedChart.description,
            });
        }
        // update chart
        const updatedChart = await this.savedChartModel.createVersion(
            upstreamChart.uuid,
            {
                tableName: promotedChart.tableName,
                metricQuery: promotedChart.metricQuery,
                chartConfig: promotedChart.chartConfig,
                tableConfig: promotedChart.tableConfig,
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
        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );
        const { promotedChart, upstreamChart } = await this.getPromoteCharts(
            user,
            upstreamProjectUuid,
            chartUuid,
        );
        await this.checkPromoteChartPermissions(
            user,
            promotedChart,
            upstreamChart,
        );

        return this.upsertChart(user, promotedChart, upstreamChart);
    }

    async upsertDashboard(
        user: SessionUser,
        promotedContent: PromotedDashboard,
        upstreamContent: UpstreamDashboard,
    ) {
        const promotedDashboard = promotedContent.dashboard;
        if (upstreamContent.dashboard === undefined) {
            // There are no dashboards with the same slug, we create the chart, and the space if needed
            // We only check the org/project access

            const newSpace =
                upstreamContent.space ||
                (await this.getOrCreateSpace(
                    // THis should be using upstreamContent.space
                    user,
                    upstreamContent.projectUuid,
                    {
                        name: promotedContent.space.name,
                        isPrivate: promotedContent.space.isPrivate || false,
                        projectUuid: promotedContent.projectUuid,
                        slug: promotedContent.space.slug,
                        userId: user.userId,
                    },
                ));

            // Create new dashboard
            const newDashboardData: CreateDashboard & {
                slug: string;
            } = {
                ...promotedContent.dashboard,
                spaceUuid: newSpace.uuid,
                slug: promotedContent.dashboard.slug,
            };
            const newDashboard = await this.dashboardModel.create(
                newSpace.uuid,
                newDashboardData,
                user,
                upstreamContent.projectUuid,
            );

            return newDashboard;
        }

        // We override existing dashboard details
        const upstreamDashboard = upstreamContent.dashboard;

        if (
            upstreamDashboard.name !== promotedDashboard.name ||
            upstreamDashboard.description !== promotedDashboard.description
        ) {
            // We also update dashboard name and description if they have changed
            await this.savedChartModel.update(upstreamDashboard.uuid, {
                name: promotedDashboard.name,
                description: promotedDashboard.description,
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

        const promotedDashboard = {
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

        await this.checkPromoteDashboardPermissions(
            user,
            promotedDashboard,
            upstreamDashboard,
        );

        // Check permissions for all chart tiles
        const chartsUuids = dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (isChartTile(tile) && tile.properties.savedChartUuid) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);
        const chartPromises = chartsUuids.map((chartUuid) =>
            this.getPromoteCharts(user, upstreamProjectUuid, chartUuid),
        );
        const charts = await Promise.all(chartPromises);
        charts.forEach(({ promotedChart, upstreamChart }) =>
            this.checkPromoteChartPermissions(
                user,
                promotedChart,
                upstreamChart,
            ),
        );

        // at this point, all permisions checks are done, so we can safely promote the dashboard and charts.

        await this.upsertDashboard(user, promotedDashboard, upstreamDashboard);

        // Upserting all charts
        const upsertChartPromises = charts.map(
            ({ promotedChart, upstreamChart }) =>
                this.upsertChart(user, promotedChart, upstreamChart),
        );
        await Promise.all(upsertChartPromises);

        return promotedDashboard.dashboard;
    }
    /*
    async createChart(user: SessionUser, chart: PromoteChart) {
        // There are no chart with the same slug, we create the chart, and the space if needed
            // We only check the org/project access
           
            if (chart.dashboardUuid) {
                const newChartData: CreateSavedChart & {
                    slug: string;
                    updatedByUser: UpdatedByUser;
                } = {
                    ...chart,
                    dashboardUuid: chart.dashboardUuid,
                    updatedByUser: user,
                    slug: chart.slug,
                };
                const newChart = await this.savedChartModel.create(
                    chart.projectUuid,
                    user.userUuid,
                    newChartData,
                );
                return newChart
            } else {
                const newSpace = await this.getOrCreateSpace(user, chart.projectUuid, {
                    name: chart.space.name, 
                    isPrivate: chart.space.isPrivate,
                    projectUuid: chart.projectUuid,
                    slug: chart.space.slug,
                    userId: user.userId
    
                })

                // Create new chart
                const newChartData: CreateSavedChart & {
                    slug: string;
                    updatedByUser: UpdatedByUser;
                } = {
                    ...chart,
                    dashboardUuid: undefined, // We don't copy charts within dashboards
                    spaceUuid: newSpace.uuid,
                    updatedByUser: user,
                    slug: chart.slug,
                };
                const newChart = await this.savedChartModel.create(
                    chart.projectUuid,
                    user.userUuid,
                    newChartData,
                );
                return newChart

            }
            



            
            return newChart;
    }

    async promoteChart(user: SessionUser, chartUuid: string, checkPermissionsOnly=false ) {

        const promotedChart = await this.savedChartModel.get(
            chartUuid,
            undefined,
        );
        const { organizationUuid, projectUuid } = promotedChart;
        if (promotedChart.dashboardUuid)
            throw new ParameterError(
                `We can't promote charts within dashboards`,
            );
        const space = await this.spaceModel.getSpaceSummary(
            promotedChart.spaceUuid,
        );

        if (space.isPrivate) {
            throw new ParameterError(
                `We can't promote charts from private spaces`,
            );
        }

        await this.checkPermissions({
            user,
            subjectType: 'SavedChart',
            organizationUuid,
            projectUuid,
            space,
            context: 'this chart and project',
            fromProjectUuid: projectUuid,
            chartUuid,
        });

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );

        const existingUpstreamCharts = await this.savedChartModel.find({
            projectUuid: upstreamProjectUuid,
            slug: promotedChart.slug,
        });

        if (existingUpstreamCharts.length === 0) {
            // There are no chart with the same slug, we create the chart, and the space if needed
            // We only check the org/project access
            await this.checkPermissions({
                user,
                subjectType: 'SavedChart',
                organizationUuid,
                projectUuid,
                space: undefined,
                context: 'the upstream project',
                fromProjectUuid: projectUuid,
                toProjectUuid: upstreamProjectUuid,
                chartUuid,
            });
            const newSpace = await this.getOrCreateSpace(user, projectUuid, upstreamProjectUuid, {
                name: space.name, 
                isPrivate: space.isPrivate,
                projectUuid: upstreamProjectUuid,
                slug: space.slug,
                userId: user.userId

            })

            // Create new chart
            const newChartData: CreateSavedChart & {
                slug: string;
                updatedByUser: UpdatedByUser;
            } = {
                ...promotedChart,
                dashboardUuid: undefined, // We don't copy charts within dashboards
                spaceUuid: newSpace.uuid,
                updatedByUser: promotedChart.updatedByUser!,
                slug: promotedChart.slug,
            };
            const newChart = await this.savedChartModel.create(
                upstreamProjectUuid,
                user.userUuid,
                newChartData,
            );

            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    chartId: chartUuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: promotedChart.slug,
                    hasExistingContent: false,
                    withNewSpace: newSpace.isNew,
                },
            });

            return newChart;
        }
        if (existingUpstreamCharts.length === 1) {
            // We override existing chart details
            const upstreamChart = existingUpstreamCharts[0];
            const upstreamSpace = await this.spaceModel.getSpaceSummary(
                upstreamChart.spaceUuid,
            );

            await this.checkPermissions({
                user,
                subjectType: 'SavedChart',
                organizationUuid,
                projectUuid: upstreamProjectUuid,
                space: upstreamSpace,
                context: 'the upstream chart and project',
                fromProjectUuid: projectUuid,
                toProjectUuid: upstreamProjectUuid,
                chartUuid,
            });

            if (
                upstreamChart.name !== promotedChart.name ||
                upstreamChart.description !== promotedChart.description
            ) {
                // We also update chart name and description if they have changed
                await this.savedChartModel.update(upstreamChart.uuid, {
                    name: promotedChart.name,
                    description: promotedChart.description,
                });
            }

            const updatedChart = await this.savedChartModel.createVersion(
                upstreamChart.uuid,
                {
                    tableName: promotedChart.tableName,
                    metricQuery: promotedChart.metricQuery,
                    chartConfig: promotedChart.chartConfig,
                    tableConfig: promotedChart.tableConfig,
                },
                user,
            );
            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    chartId: chartUuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: promotedChart.slug,
                    hasExistingContent: true,
                },
            });

            return updatedChart;
        }

        this.analytics.track({
            event: 'promote.error',
            userId: user.userUuid,
            properties: {
                chartId: chartUuid,
                fromProjectId: projectUuid,
                toProjectId: upstreamProjectUuid,
                organizationId: organizationUuid,
                slug: promotedChart.slug,
                error: `There are multiple charts with the same identifier`,
            },
        });
        // Multiple charts with the same slug
        throw new AlreadyExistsError(
            `There are multiple charts with the same identifier ${promotedChart.slug}`,
        );
    }

    async promoteCharts(user: SessionUser, promoteCharts: string[]) {
        const chartPromises = promoteCharts.map((chartUuid) =>
            this.promoteChart(user, chartUuid),
        );
        return Promise.all(chartPromises);
    }

    async promoteDashboard(user: SessionUser, dashboardUuid: string) {

        const promotedDashboard = await this.dashboardModel.getById(
            dashboardUuid,
        );
        const { organizationUuid, projectUuid } = promotedDashboard;
        const space = await this.spaceModel.getSpaceSummary(
            promotedDashboard.spaceUuid,
        );
        if (space.isPrivate) {
            throw new ParameterError(
                `We can't promote charts from private spaces`,
            );
        }
        const chartsUuids = promotedDashboard.tiles.reduce<string[]>(
            (acc, tile) => {
                if (isChartTile(tile) && tile.properties.savedChartUuid) {
                    return [...acc, tile.properties.savedChartUuid];
                }
                return acc;
            },
            [],
        );
        const chartPromises = chartsUuids.map((chartUuid) =>
            this.savedChartModel.get(chartUuid),
        );
        const charts = await Promise.all(chartPromises);

        // Check permission for all charts
        // If one of the chart is throwing an error, then we will not promote this dashboard 
        charts.map((chart)=> {

        })
        try {
        await this.checkPermissions({
            user,
            subjectType: 'Dashboard',
            organizationUuid,
            projectUuid,
            space,
            context: 'this dashboard and project',
            fromProjectUuid: projectUuid,
            dashboardUuid,
        });

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );

        const existingUpstreamDashboards = await this.dashboardModel.find({
            projectUuid: upstreamProjectUuid,
            slug: promotedDashboard.slug,
        });
    
        if (existingUpstreamDashboards.length === 0) {
            // There are no dashboards with the same slug, we create the chart, and the space if needed
            // We only check the org/project access
            await this.checkPermissions({
                user,
                subjectType: 'Dashboard',
                organizationUuid,
                projectUuid,
                space: undefined,
                context: 'the upstream project',
                fromProjectUuid: projectUuid,
                toProjectUuid: upstreamProjectUuid,
                dashboardUuid,
            });

            let newSpaceUuid: string;
            const existingSpace = await this.spaceModel.find({
                projectUuid: upstreamProjectUuid,
                slug: space.slug,
            });
            if (existingSpace.length === 0) {
                // We have 0 or more than 1 space with the same slug
                await this.checkPermissions({
                    user,
                    subjectType: 'Dashboard',
                    organizationUuid,
                    projectUuid,
                    space: undefined,
                    context: 'the upstream project',
                    fromProjectUuid: projectUuid,
                    toProjectUuid: upstreamProjectUuid,
                    dashboardUuid,
                });

                // We create a new space
                const newSpace = await this.spaceModel.createSpace(
                    upstreamProjectUuid,
                    space.name,
                    user.userId,
                    space.isPrivate,
                    space.slug,
                );
                newSpaceUuid = newSpace.uuid;
            } else if (existingSpace.length === 1) {
                // We have an existing space with the same slug
                await this.checkPermissions({
                    user,
                    subjectType: 'Dashboard',
                    organizationUuid,
                    projectUuid: upstreamProjectUuid,
                    space: existingSpace[0],
                    context: 'the upstream space and project',
                    fromProjectUuid: projectUuid,
                    toProjectUuid: upstreamProjectUuid,
                    dashboardUuid,
                });

                newSpaceUuid = existingSpace[0].uuid;
            } else {
                // Multiple spaces with the same slug
                throw new AlreadyExistsError(
                    `There are multiple spaces with the same identifier ${space.slug}`,
                );
            }

            // Create new dashboard
            const newDashboardData: CreateDashboard & {
                slug: string;
            } = {
                ...promotedDashboard,
                spaceUuid: newSpaceUuid,
                slug: promotedDashboard.slug,
            };
            const newDashboard = await this.dashboardModel.create(
                newSpaceUuid,
                newDashboardData,
                user,
                upstreamProjectUuid,
            );
            await this.promoteCharts(user, chartsUuids);

            await this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    dashboardId: newDashboard.uuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: newDashboard.slug,
                    hasExistingContent: false,
                    withNewSpace: existingSpace.length !== 1,
                },
            });

            return newDashboard;
        }
        if (existingUpstreamDashboards.length === 1) {
            // We override existing dashboard details
            const upstreamDashboard = existingUpstreamDashboards[0];
            const upstreamSpace = await this.spaceModel.getSpaceSummary(
                upstreamDashboard.spaceUuid,
            );

            await this.checkPermissions({
                user,
                subjectType: 'Dashboard',
                organizationUuid,
                projectUuid: upstreamProjectUuid,
                space: upstreamSpace,
                context: 'the upstream dashboard and project',
                fromProjectUuid: projectUuid,
                toProjectUuid: upstreamProjectUuid,
                dashboardUuid,
            });

            if (
                upstreamDashboard.name !== promotedDashboard.name ||
                upstreamDashboard.description !== promotedDashboard.description
            ) {
                // We also update dashboard name and description if they have changed
                await this.savedChartModel.update(upstreamDashboard.uuid, {
                    name: promotedDashboard.name,
                    description: promotedDashboard.description,
                });
            }

            const updatedChart = await this.dashboardModel.addVersion(
                upstreamDashboard.uuid,
                promotedDashboard,
                user,
                projectUuid,
            );
            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    dashboardId: updatedChart.uuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: promotedDashboard.slug,
                    hasExistingContent: true,
                },
            });

            await this.promoteCharts(user, chartsUuids);

            return updatedChart;
        }

        await this.analytics.track({
            event: 'promote.error',
            userId: user.userUuid,
            properties: {
                dashboardId: promotedDashboard.uuid,
                fromProjectId: projectUuid,
                toProjectId: upstreamProjectUuid,
                organizationId: organizationUuid,
                slug: promotedDashboard.slug,
                error: `There are multiple dashboards with the same identifier`,
            },
        });
        // Multiple charts with the same slug
        throw new AlreadyExistsError(
            `There are multiple dashboards with the same identifier ${promotedDashboard.slug}`,
        );
    } catch(e) {
        console.error(e)
        throw e 
    }
    } */
}
