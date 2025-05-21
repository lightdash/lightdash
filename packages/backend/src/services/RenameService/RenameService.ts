import { subject } from '@casl/ability';
import {
    ApiRenameBody,
    ApiRenameChartBody,
    ApiRenameResponse,
    assertUnreachable,
    DashboardDAO,
    Explore,
    ForbiddenError,
    getErrorMessage,
    getFieldRef,
    getItemId,
    isExploreError,
    NameChanges,
    NotFoundError,
    NotImplementedError,
    ParameterError,
    RenameResourcesPayload,
    RenameType,
    RequestMethod,
    SavedChartDAO,
    SCHEDULER_TASKS,
    SchedulerAndTargets,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';

import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import {
    getNameChanges,
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

    async getFieldsForChart({
        user,
        projectUuid,
        chartUuid,
    }: {
        user: SessionUser;
        projectUuid: string;
        chartUuid: string;
    }) {
        const chart = await this.savedChartModel.get(chartUuid);

        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: chart.organizationUuid,
                    projectUuid: chart.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explore = await this.projectModel.getExploreFromCache(
            projectUuid,
            chart.tableName,
        );
        if (isExploreError(explore)) {
            throw new NotFoundError(
                `Valid explore ${chart.tableName} not found`,
            );
        }

        const fields: { [table: string]: string[] } = {};
        Object.keys(explore.tables).forEach((tableName) => {
            const table = explore.tables[tableName];
            const dimensionsAndMetrics = Object.keys(table.dimensions).concat(
                Object.keys(table.metrics),
            );
            fields[tableName] = dimensionsAndMetrics.map(
                (field) => getItemId({ name: field, table: tableName }), // add explore prefix
            );
        });

        return {
            ...fields,
            // Do not do chart specific fields, since these will break if people select "fix all ocurrences"
            /*
            tableCalculations: chart.metricQuery.tableCalculations?.map(
                (tc) => tc.name,
            ),
            customMetrics: chart.metricQuery.additionalMetrics?.map(
                (tc) => tc.name,
            ),
            customDimensions: chart.metricQuery.customDimensions?.map(
                (tc) => tc.name,
            ),
            */
        };
    }

    /**
     * Triggered from the UI on validation settings
     */
    async renameChart({
        user,
        projectUuid,
        chartUuid,
        from,
        to,
        type,
        fixAll,
        context,
    }: ApiRenameChartBody & {
        user: SessionUser;
        chartUuid: string;
        projectUuid: string;
        context: RequestMethod;
    }): Promise<string | undefined> {
        if (from === to) {
            throw new ParameterError(
                'Old and new names are the same, nothing to rename',
            );
        }

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

        const chart = await this.savedChartModel.get(chartUuid);

        const nameChanges = getNameChanges({
            from,
            to,
            table: chart.tableName,
            type,
        });

        switch (type) {
            case RenameType.MODEL:
                // Verify the model we want to assign to really exists
                // This will throw an error if the model does not exist
                await this.projectModel.getExploreFromCache(projectUuid, to);
                break;
            case RenameType.FIELD:
                // When updating  from a chart (UI) we want to make sure the field exists in the current explore  or custom fields in chart
                // From the UI, these should be already selected from a field, using getFieldsForChart
                // Note: this option is not currently available on the UI, since we only display metrics and dimensions from explore on getFieldsForChart
                const fieldsInChart = [
                    ...chart.metricQuery.tableCalculations.map((tc) => tc.name),
                    ...(chart.metricQuery.additionalMetrics?.map(
                        (am) => am.name,
                    ) ?? []),
                    ...(chart.metricQuery.customDimensions?.map(
                        (cd) => cd.name,
                    ) ?? []),
                ];

                if (fieldsInChart.includes(to)) {
                    // It could be a table calculation / dimension / custom metric
                    this.logger.info(
                        `Replacing field "${to}" with "${from}" from the chart "${chart.name}"`,
                    );
                    throw new NotImplementedError(
                        `Replacing fields on custom chart fields is not currently supported`,
                    );
                } else {
                    // Otherwise, it will keep failing
                    // This method will throw an error if the field does not exist on explore
                    const explore = await this.findExploreForField({
                        projectUuid,
                        fieldName: to,
                        model: chart.tableName,
                        isFullId: true,
                    });
                    this.logger.info(
                        `Replacing field "${to}" with "${from}" from the explore "${explore.name}"`,
                    );
                }
                break;
            default:
                assertUnreachable(type, `Unexpected rename type ${type}`);
        }

        const { updatedChart, hasChanges } = renameSavedChart({
            type,
            chart,
            nameChanges,
            validate: true,
        });

        if (hasChanges) {
            await this.savedChartModel.createVersion(
                chart.uuid,
                updatedChart,
                undefined,
            );
        }

        this.analytics.track({
            event: 'rename_chart.executed',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context,
                dryRun: false,
                type,
                ...nameChanges,
                chartId: chart.uuid,
            },
        });

        if (fixAll) {
            this.logger.debug(
                `Scheduling a rename of all charts for ${JSON.stringify(
                    nameChanges,
                )}`,
            );
            const { jobId } = await this.scheduleRenameResources({
                context,
                dryRun: false,
                user,
                projectUuid,
                type,
                model: chart.tableName,
                ...nameChanges,
            });
            return jobId;
        }

        return undefined;
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

    private async findExploreForField({
        projectUuid,
        fieldName,
        model,
        isFullId,
    }: {
        projectUuid: string;
        fieldName: string;
        model?: string;
        isFullId: boolean; // If true, we will be looking at a full field id, with table prefix (eg: payment_customer_id)
    }): Promise<Explore> {
        // Find the field we want to replace in the explore, and filter charts by that explore
        // If model is provided, we only want to rename the field on that model
        // If model is not provided, we try finding the field in all the explores. If there are more than 1, we throw an error
        const explores = model
            ? {
                  [model]: await this.projectModel.getExploreFromCache(
                      projectUuid,
                      model,
                  ),
              }
            : await this.projectModel.getAllExploresFromCache(projectUuid);

        const exploreWithFields = Object.values(explores).reduce<Explore[]>(
            (acc, ex) => {
                if (isExploreError(ex)) return acc;

                // Check all tables in the explore, not just the base table
                const hasField = Object.entries(ex.tables).some(
                    ([tableName, table]) => {
                        const allFields = Object.keys(table.dimensions).concat(
                            Object.keys(table.metrics),
                        );
                        const fieldIds = isFullId
                            ? allFields.map((f) =>
                                  getItemId({ table: tableName, name: f }),
                              )
                            : allFields;
                        return fieldIds.includes(fieldName);
                    },
                );

                return hasField ? [...acc, ex] : acc;
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
                `Field "${fieldName}" was not found ${
                    model ? `on model "${model}"` : `on any existing models`
                }`,
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
        fromReference,
        toReference,
        dryRun,
        model,
        fromFieldName,
        toFieldName,
    }: RenameResourcesPayload): Promise<ApiRenameResponse['results']> {
        try {
            let exploreName: string;
            let nameChanges: NameChanges;

            if (fromReference && toReference && model) {
                exploreName = model;
                this.logger.debug(
                    `Rename resources: Got references for field id "${fromReference}" to "${toReference}"`,
                );
                nameChanges = {
                    from,
                    to,
                    fromReference,
                    toReference,
                    fromFieldName,
                    toFieldName,
                };
            } else {
                switch (type) {
                    case RenameType.MODEL:
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

                        nameChanges = {
                            from, // this is just the  table prefix
                            to,
                            fromReference: from,
                            toReference: to,
                            fromFieldName: undefined,
                            toFieldName: undefined,
                        };
                        break;
                    case RenameType.FIELD:
                        let explore: Explore;
                        let fieldInExplore = from;

                        // Find the field we want to replace in the explore, and filter charts by that explore
                        // When filtering explores, we need to check if the explore exists on from, or to
                        // since people might be running this rename method before or after dbt is updated
                        try {
                            explore = await this.findExploreForField({
                                projectUuid,
                                fieldName: from,
                                model,
                                isFullId: false,
                            });
                        } catch (e) {
                            if (e instanceof ParameterError) {
                                // found on multiple models
                                throw e;
                            } else {
                                this.logger.debug(
                                    `Explore not found for field "${from}", trying "${to}"`,
                                );
                                explore = await this.findExploreForField({
                                    projectUuid,
                                    fieldName: to,
                                    model,
                                    isFullId: false,
                                });
                                fieldInExplore = to;
                            }
                        }

                        const table = explore.tables[explore.baseTable];
                        const dimensionsAndMetrics = [
                            ...Object.values(table.dimensions),
                            ...Object.values(table.metrics),
                        ];
                        const field = dimensionsAndMetrics.find(
                            (d) => d.name === fieldInExplore || d.name === to,
                        );

                        if (!field) {
                            // This should not happen, since we have already filtered the explores
                            throw new UnexpectedServerError(
                                `Field "${fieldInExplore}" was not found ${
                                    model
                                        ? `on model "${model}"`
                                        : `on any existing models`
                                }`,
                            );
                        }

                        exploreName = explore.name;

                        nameChanges = {
                            from: getItemId({
                                ...field,
                                name: from,
                            }),
                            to: getItemId({
                                ...field,
                                name: to,
                            }),
                            fromReference: getFieldRef(field),
                            toReference: getFieldRef({
                                ...field,
                                name: to,
                            }),
                            fromFieldName: from,
                            toFieldName: to,
                        };

                        this.logger.debug(
                            `Rename resources: Renaming field id "${nameChanges.from}" to "${nameChanges.to}"`,
                        );
                        break;
                    default:
                        assertUnreachable(
                            type,
                            `Unexpected rename type ${type}`,
                        );
                }
            }

            this.logger.debug(
                `Rename resources: Filtering charts by explore ${exploreName}`,
            );

            // We get all explores and their joins, because the model/field change might
            // happen on a join, not the main chart explore name
            // For example, if we want to rename "orders" model,
            // and "payments" contains a join to "orders", we also want to rename all "charts"
            // with exploreName "payments", since they can contain a join to "orders"
            const explores = await this.projectModel.getAllExploresFromCache(
                projectUuid,
            );
            // Do not filter explore errors, since the explore might be failing already, because of some renames
            const exploreJoins: string[] = Object.values(explores)
                .filter((e) =>
                    e.joinedTables?.some((j) => j.table === exploreName),
                )
                .map((e) => e.name);
            const exploreNames = new Set([exploreName, ...exploreJoins]);
            this.logger.info(
                `Rename resources: Filtering chart for explore "${exploreName}" and joins: ${exploreJoins.join(
                    ',',
                )}`,
            );
            // Note: filtering on explore name might return charts where the explore name is from a previous version
            const chartSummaries = await this.savedChartModel.find({
                projectUuid,
                exploreNames: Array.from(exploreNames),
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
                const { updatedChart, hasChanges } = renameSavedChart({
                    type,
                    chart: c,
                    nameChanges,
                    validate: false, // Do not validate on bulk rename
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
                        nameChanges,
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
                    const { updatedAlert, hasChanges } = renameAlert(
                        type,
                        d,
                        nameChanges,
                    );

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
                        renameDashboardScheduler(type, d, nameChanges);
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
                    text: dryRun,
                    renamedCharts: chartChanges.length,
                    renamedDashboards: dashboardChanges.length,
                    renamedAlerts: alertChanges.length,
                    renamedDashboardSchedulers:
                        dashboardSchedulerChanges.length,
                    ...nameChanges,
                },
            });

            if (dryRun !== true) {
                await Promise.all(
                    chartChanges.map((c) =>
                        this.savedChartModel.createVersion(
                            c.uuid,
                            c,
                            undefined, // SessionUser
                        ),
                    ),
                );
                await Promise.all(
                    dashboardChanges.map((d) =>
                        this.dashboardModel.addVersion(
                            d.uuid,
                            d,
                            { userUuid },
                            projectUuid,
                        ),
                    ),
                );

                await Promise.all(
                    alertChanges.map((a) =>
                        this.schedulerModel.updateScheduler(a),
                    ),
                );

                await Promise.all(
                    dashboardSchedulerChanges.map((d) =>
                        this.schedulerModel.updateScheduler(d),
                    ),
                );
            }

            return {
                charts: chartChanges.map((c) => ({
                    uuid: c.uuid,
                    name: c.name,
                })),
                dashboards: dashboardChanges.map((d) => ({
                    uuid: d.uuid,
                    name: d.name,
                })),
                alerts: alertChanges.map((a) => ({
                    uuid: a.schedulerUuid,
                    name: a.name,
                })),
                dashboardSchedulers: dashboardSchedulerChanges.map((d) => ({
                    uuid: d.schedulerUuid,
                    name: d.name,
                })),
            };
        } catch (error) {
            this.analytics.track({
                event: 'rename_resource.error',
                userId: userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    context,
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
