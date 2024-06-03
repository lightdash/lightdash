import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    CreateDashboard,
    CreateSavedChart,
    ForbiddenError,
    isChartTile,
    NotFoundError,
    ParameterError,
    SavedChartDAO,
    SessionUser,
    SpaceSummary,
    UpdatedByUser,
} from '@lightdash/common';
import { Saved } from '@slack/web-api/dist/response/ChatPostMessageResponse';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { BaseService } from '../BaseService';

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
        subjectType: 'Charts' | 'Dashboards';
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
                `You don't have the right access permissions on ${context} to promote ${subjectType.toLowerCase()}.`,
            );
        }
    };

    async promoteChart(user: SessionUser, chartUuid: string) {
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
            subjectType: 'Charts',
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
                subjectType: 'Charts',
                organizationUuid,
                projectUuid,
                space: undefined,
                context: 'the upstream project',
                fromProjectUuid: projectUuid,
                toProjectUuid: upstreamProjectUuid,
                chartUuid,
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
                    subjectType: 'Charts',
                    organizationUuid,
                    projectUuid: upstreamProjectUuid,
                    space: undefined,
                    context: 'the upstream project',
                    fromProjectUuid: projectUuid,
                    toProjectUuid: upstreamProjectUuid,
                    chartUuid,
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
                    subjectType: 'Charts',
                    organizationUuid,
                    projectUuid: upstreamProjectUuid,
                    space: existingSpace[0],
                    context: 'the upstream space and project',
                    fromProjectUuid: projectUuid,
                    toProjectUuid: upstreamProjectUuid,
                    chartUuid,
                });

                newSpaceUuid = existingSpace[0].uuid;
            } else {
                // Multiple spaces with the same slug
                throw new AlreadyExistsError(
                    `There are multiple spaces with the same identifier ${space.slug}`,
                );
            }

            // Create new chart
            const newChartData: CreateSavedChart & {
                slug: string;
                updatedByUser: UpdatedByUser;
            } = {
                ...promotedChart,
                dashboardUuid: undefined, // We don't copy charts within dashboards
                spaceUuid: newSpaceUuid,
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
                    withNewSpace: existingSpace.length !== 1,
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
                subjectType: 'Charts',
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

        const chartsWithinDashboards = charts.filter(
            (chart) => chart.dashboardUuid !== null,
        );

        // TODO also prmote charts within dashboards

        await this.checkPermissions({
            user,
            subjectType: 'Dashboards',
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
                subjectType: 'Dashboards',
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
                    subjectType: 'Dashboards',
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
                    subjectType: 'Dashboards',
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
                subjectType: 'Dashboards',
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
    }
}
