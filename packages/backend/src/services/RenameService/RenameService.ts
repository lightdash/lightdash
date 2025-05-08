import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ApiRenameBody,
    ApiRenameResponse,
    ChartSummary,
    DashboardDAO,
    Explore,
    ForbiddenError,
    getDeepestPaths,
    getErrorMessage,
    getFieldRef,
    getItemId,
    isDashboardChartTileType,
    isExploreError,
    isSubPath,
    NotFoundError,
    ParameterError,
    PromotedChart as PromotedChangeChart,
    PromotedSpace,
    PromotionAction,
    PromotionChanges,
    RenameResourcesPayload,
    RenameType,
    RequestMethod,
    SavedChartDAO,
    SCHEDULER_TASKS,
    SchedulerAndTargets,
    SessionUser,
    Space,
    SpaceShare,
    SpaceSummary,
    UnexpectedServerError,
} from '@lightdash/common';
import { cloneDeep } from 'lodash';

import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import {
    renameAlert,
    renameDashboard,
    renameDashboardScheduler,
    renameSavedChart,
} from './rename';

type RenameServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    schedulerClient: SchedulerClient;
    schedulerModel: SchedulerModel;
};

export class RenameService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly savedChartModel: SavedChartModel;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly dashboardModel: DashboardModel;

    private readonly schedulerClient: SchedulerClient;

    private readonly schedulerModel: SchedulerModel;

    constructor(args: RenameServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.savedChartModel = args.savedChartModel;
        this.projectModel = args.projectModel;
        this.dashboardModel = args.dashboardModel;
        this.schedulerClient = args.schedulerClient;
        this.schedulerModel = args.schedulerModel;
    }

    async scheduleRenameResources({
        user,
        projectUuid,
        context,
        ...renameBody
    }: ApiRenameBody & {
        user: SessionUser;
        projectUuid: string;
        context: RequestMethod;
    }) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const payload: RenameResourcesPayload = {
            ...renameBody,
            context,
            // TraceTaskBase
            organizationUuid: user.organizationUuid!,
            projectUuid,
            userUuid: user.userUuid,
            schedulerUuid: undefined,
        };

        return this.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.RENAME_RESOURCES,
            payload,
        );
    }

    private async findExploreForField(
        projectUuid: string,
        fieldName: string,
    ): Promise<Explore> {
        // Find the field we want to replace in the explore, and filter charts by that explore
        const explores = await this.projectModel.getAllExploresFromCache(
            projectUuid,
        );
        const exploreWithFields = Object.values(explores).reduce<Explore[]>(
            (acc, ex) => {
                if (isExploreError(ex)) return acc;

                const table = ex.tables[ex.baseTable];

                const allFields = Object.keys(table.dimensions).concat(
                    Object.keys(table.metrics),
                );
                const hasField = allFields.includes(fieldName);

                if (hasField) {
                    acc.push(ex);
                }
                return acc;
            },
            [],
        );
        this.logger.debug(
            `Rename resources: Explores with field ${fieldName}: ${exploreWithFields
                .map((e) => e.name)
                .join(', ')}`,
        );

        if (exploreWithFields.length === 0) {
            throw new NotFoundError(
                `Field "${fieldName}" was not found on any existing models`,
            );
        }
        if (exploreWithFields.length > 1) {
            throw new ParameterError(
                `Field "${fieldName}" was found on multiple models: ${exploreWithFields
                    .map((e) => e.name)
                    .join(', ')}`,
            );
        }

        return exploreWithFields[0];
    }

    async runScheduledRenameResources({
        userUuid,
        organizationUuid,
        projectUuid,
        type,
        context,
        from,
        to,
        test,
        model,
    }: RenameResourcesPayload): Promise<ApiRenameResponse['results']> {
        try {
            let exploreName: string;
            let replaceFrom: string;
            let replaceTo: string;
            let replaceFromReference: string;
            let replaceToReference: string;
            if (type === RenameType.MODEL) {
                // This will throw error if explore does not exist
                // When filtering explores, we need to check if the explore exists on from, or to
                // since people might be running this rename method before or after dbt is updated

                try {
                    await this.projectModel.getExploreFromCache(
                        projectUuid,
                        from,
                    );
                } catch (error) {
                    try {
                        await this.projectModel.getExploreFromCache(
                            projectUuid,
                            to,
                        );
                    } catch (err) {
                        throw new NotFoundError(
                            `Neither "${from}" nor "${to}" explores exist in the project.`,
                        );
                    }
                }
                exploreName = from;
                replaceFrom = from; // this is just the  table prefix
                replaceFromReference = from; // this is just the table prefix
                replaceTo = to;
                replaceToReference = to;
            } else {
                // Fields

                let explore: Explore;
                // If model is provided, we only want to rename the field on that model
                // If model is not provided, we try finding the field in all the explores. If there are more than 1, we throw an error
                if (model) {
                    const exploreOrError =
                        await this.projectModel.getExploreFromCache(
                            projectUuid,
                            model,
                        );
                    if (isExploreError(exploreOrError)) {
                        throw new NotFoundError(`Invalid explore "${from}"`);
                    }
                    explore = exploreOrError;
                } else {
                    // Find the field we want to replace in the explore, and filter charts by that explore
                    // When filtering explores, we need to check if the explore exists on from, or to
                    // since people might be running this rename method before or after dbt is updated
                    try {
                        explore = await this.findExploreForField(
                            projectUuid,
                            from,
                        );
                    } catch (e) {
                        explore = await this.findExploreForField(
                            projectUuid,
                            to,
                        );
                    }
                }

                const table = explore.tables[explore.baseTable];
                const dimensionsAndMetrics = [
                    ...Object.values(table.dimensions),
                    ...Object.values(table.metrics),
                ];
                const field = dimensionsAndMetrics.find((d) => d.name === from);

                if (!field) {
                    // This should not happen, since we have already filtered the explores
                    throw new UnexpectedServerError(
                        `Field "${from}" was not found on any existing models`,
                    );
                }

                exploreName = explore.name;
                replaceFrom = getItemId(field);
                replaceFromReference = getFieldRef(field);
                replaceTo = getItemId({
                    ...field,
                    name: to,
                });
                replaceToReference = getFieldRef({
                    ...field,
                    name: to,
                });

                this.logger.debug(
                    `Rename resources: Renaming field id "${replaceFrom}" to "${replaceTo}"`,
                );
            }
            this.logger.debug(
                `Rename resources: Filtering charts by explore ${exploreName}`,
            );
            const chartSummaries = await this.savedChartModel.find({
                projectUuid,
                exploreName,
            });

            this.logger.debug(
                `Rename resources: Found ${chartSummaries.length} chartSummaries to rename`,
            );

            // We intentionally do not filter charts on private spaces, since we want to rename all charts
            // And the user will not be able to see the charts in private spaces anyway, so it should not become a vulnerability
            const chartPromises = chartSummaries.map((chart) =>
                this.savedChartModel.get(chart.uuid),
            );

            const charts = await Promise.all(chartPromises);
            const chartChanges = charts.reduce<SavedChartDAO[]>((acc, c) => {
                const { updatedChart, hasChanges } = renameSavedChart(type, c, {
                    from: replaceFrom,
                    fromReference: replaceFromReference,
                    to: replaceTo,
                    toReference: replaceToReference,
                });

                if (hasChanges) {
                    acc.push(updatedChart);
                }
                return acc;
            }, []);

            this.logger.info(
                `Rename resources: Found ${chartChanges.length} charts with changes to rename`,
            );
            const dashboardSummaries = await this.dashboardModel.find({
                projectUuid,
            });
            this.logger.info(
                `Rename resources: Found ${dashboardSummaries.length} dashboard summaries to rename`,
            );
            const dashboardPromises = dashboardSummaries.map((dashboard) =>
                this.dashboardModel.getById(dashboard.uuid),
            );
            const dashboards = await Promise.all(dashboardPromises);

            const dashboardChanges = dashboards.reduce<DashboardDAO[]>(
                (acc, d) => {
                    const { updatedDashboard, hasChanges } = renameDashboard(
                        type,
                        d,
                        {
                            from: replaceFrom,
                            fromReference: replaceFromReference,
                            to: replaceTo,
                            toReference: replaceToReference,
                        },
                    );

                    if (hasChanges) {
                        acc.push(updatedDashboard);
                    }
                    return acc;
                },
                [],
            );

            this.logger.info(
                `Rename resources: Found ${dashboardChanges.length} dashboards with changes to rename`,
            );

            const chartSchedulerPromises = chartSummaries.map((chart) =>
                this.schedulerModel.getChartSchedulers(chart.uuid),
            );
            const chartSchedulers = await Promise.all(chartSchedulerPromises);
            const alerts = chartSchedulers
                .flat()
                .filter((scheduler) => scheduler.thresholds !== undefined);

            const alertChanges = alerts.reduce<SchedulerAndTargets[]>(
                (acc, d) => {
                    const { updatedAlert, hasChanges } = renameAlert(type, d, {
                        from: replaceFrom,
                        fromReference: replaceFromReference,
                        to: replaceTo,
                        toReference: replaceToReference,
                    });

                    if (hasChanges) {
                        acc.push(updatedAlert);
                    }
                    return acc;
                },
                [],
            );

            const dashboardSchedulerPromises = dashboardSummaries.map(
                (dashboard) =>
                    this.schedulerModel.getDashboardSchedulers(dashboard.uuid),
            );
            const dashboardSchedulers = await Promise.all(
                dashboardSchedulerPromises,
            );
            const dashboardSchedulerChanges = dashboardSchedulers
                .flat()
                .reduce<SchedulerAndTargets[]>((acc, d) => {
                    const { updatedDashboardScheduler, hasChanges } =
                        renameDashboardScheduler(type, d, {
                            from: replaceFrom,
                            fromReference: replaceFromReference,
                            to: replaceTo,
                            toReference: replaceToReference,
                        });
                    if (hasChanges) {
                        acc.push(updatedDashboardScheduler);
                    }
                    return acc;
                }, []);

            this.logger.info(
                `Rename resources: Found ${dashboardSchedulerChanges.length} dashboard schedulers with changes to rename`,
            );

            this.analytics.track({
                event: 'rename_resource.executed',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    context,
                    text: test,
                    renamedCharts: chartChanges.length,
                    renamedDashboards: dashboardChanges.length,
                    renamedAlerts: alertChanges.length,
                    renamedDashboardSchedulers:
                        dashboardSchedulerChanges.length,
                    from,
                    to,
                    type,
                },
            });

            if (test !== true) {
                await Promise.all(
                    chartChanges.map((c) =>
                        this.savedChartModel.createVersion(
                            c.uuid,
                            c,
                            undefined,
                        ),
                    ),
                );
                await Promise.all(
                    dashboardChanges.map((d) =>
                        this.dashboardModel.addVersion(
                            d.uuid,
                            d,
                            undefined,
                            projectUuid,
                        ),
                    ),
                );

                await Promise.all(
                    alertChanges.map((a) =>
                        this.schedulerModel.updateScheduler(a),
                    ),
                );
            }

            return {
                charts: chartChanges.map((c) => c.name),
                dashboards: dashboardChanges.map((d) => d.name),
                alerts: alertChanges.map((a) => a.name),
                dashboardSchedulers: dashboardSchedulerChanges.map(
                    (d) => d.name,
                ),
            };
        } catch (error) {
            this.analytics.track({
                event: 'rename_resource.error',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    context,
                    renamedCharts: 0,
                    renamedDashboards: 0,
                    renamedAlerts: 0,
                    renamedDashboardSchedulers: 0,
                    from,
                    to,
                    type,
                    error: getErrorMessage(error),
                },
            });
            throw error;
        }
    }
}
