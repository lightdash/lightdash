import { subject } from '@casl/ability';
import {
    ApiRenameBody,
    ApiRenameChartBody,
    ApiRenameDashboardBody,
    ApiRenameResponse,
    assertUnreachable,
    DashboardDAO,
    Explore,
    ForbiddenError,
    getErrorMessage,
    getFieldRef,
    getItemId,
    isDashboardFieldTarget,
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
        const auditedAbility = this.createAuditedAbility(user);
        const chart = await this.savedChartModel.get(chartUuid);

        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    uuid: '',
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

        const auditedAbility = this.createAuditedAbility(user);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    uuid: '',
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
            case RenameType.MODEL: {
                // Verify the model we want to assign to really exists, or the one we are renaming from
                const [toResult, fromResult] = await Promise.allSettled([
                    this.projectModel.getExploreFromCache(projectUuid, to),
                    this.projectModel.getExploreFromCache(projectUuid, from),
                ]);
                if (
                    toResult.status === 'rejected' &&
                    fromResult.status === 'rejected'
                ) {
                    throw new NotFoundError(
                        `Neither "${from}" nor "${to}" explores exist in the project.`,
                    );
                }
                break;
            }
            case RenameType.FIELD:
                // When renaming a field from a chart, we validate that the target field exists
                // and ensure we're not trying to rename to a custom field (table calculation, custom metric, or custom dimension)
                // The UI uses getFieldsForChart to display available fields for selection so it should be safe to assume this should not happen. The next check is to validate requests coming from other than the UI
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
                    // The target field is a custom field (table calculation, custom metric, or custom dimension)
                    this.logger.info(
                        `Replacing field "${from}" with "${to}" from the chart "${chart.name}"`,
                    );
                    throw new NotImplementedError(
                        `Renaming to a custom field (table calculation, custom metric, or custom dimension) is not currently supported. You can rename FROM a custom field, but not TO one.`,
                    );
                } else {
                    // The target field should be a standard field from the explore
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

    /**
     * Get fields for dashboard filters rename UI.
     * If tableName is provided, returns fields from that specific explore.
     * Otherwise, returns fields from all explores referenced by the dashboard's filters.
     */
    async getFieldsForDashboard({
        user,
        projectUuid,
        dashboardUuid,
        tableName,
    }: {
        user: SessionUser;
        projectUuid: string;
        dashboardUuid: string;
        tableName?: string;
    }) {
        const auditedAbility = this.createAuditedAbility(user);
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    uuid: '',
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Collect table names to look up
        const tableNames: Set<string> = new Set();
        if (tableName) {
            tableNames.add(tableName);
        } else {
            // Collect all unique table names from all filter targets
            const allFilters = [
                ...dashboard.filters.dimensions,
                ...dashboard.filters.metrics,
                ...dashboard.filters.tableCalculations,
            ];
            for (const filter of allFilters) {
                tableNames.add(filter.target.tableName);
                if (filter.tileTargets) {
                    for (const tileTarget of Object.values(
                        filter.tileTargets,
                    )) {
                        if (tileTarget && isDashboardFieldTarget(tileTarget)) {
                            tableNames.add(tileTarget.tableName);
                        }
                    }
                }
            }
        }

        const fields: { [table: string]: string[] } = {};
        const exploreResults = await Promise.allSettled(
            Array.from(tableNames).map(async (table) => ({
                table,
                explore: await this.projectModel.getExploreFromCache(
                    projectUuid,
                    table,
                ),
            })),
        );
        for (const result of exploreResults) {
            if (result.status === 'fulfilled') {
                const { explore } = result.value;
                if (!isExploreError(explore)) {
                    Object.keys(explore.tables).forEach((expTableName) => {
                        const expTable = explore.tables[expTableName];
                        const dimensionsAndMetrics = Object.keys(
                            expTable.dimensions,
                        ).concat(Object.keys(expTable.metrics));
                        fields[expTableName] = dimensionsAndMetrics.map(
                            (field) =>
                                getItemId({
                                    name: field,
                                    table: expTableName,
                                }),
                        );
                    });
                }
            } else {
                // Explore may not exist (e.g. table was renamed), skip it
                this.logger.debug(
                    `Could not load explore when getting fields for dashboard ${dashboardUuid}: ${result.reason}`,
                );
            }
        }

        return fields;
    }

    /**
     * Triggered from the UI on validation settings for dashboard filter errors
     */
    async renameDashboardFilter({
        user,
        projectUuid,
        dashboardUuid,
        from,
        to,
        type,
        fixAll,
        context,
    }: ApiRenameDashboardBody & {
        user: SessionUser;
        dashboardUuid: string;
        projectUuid: string;
        context: RequestMethod;
    }): Promise<string | undefined> {
        if (from === to) {
            throw new ParameterError(
                'Old and new names are the same, nothing to rename',
            );
        }

        const auditedAbility = this.createAuditedAbility(user);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    uuid: '',
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);

        // Derive the table name from the dashboard's filters
        let tableName: string;
        if (type === RenameType.MODEL) {
            // For model renames, the `from` IS the old table name
            tableName = from;
        } else {
            // For field renames, find the filter that references this field
            // and use its target.tableName
            const allFilters = [
                ...dashboard.filters.dimensions,
                ...dashboard.filters.metrics,
                ...dashboard.filters.tableCalculations,
            ];
            const matchingFilter = allFilters.find(
                (f) => f.target.fieldId === from,
            );
            if (!matchingFilter) {
                throw new NotFoundError(
                    `No filter found in dashboard "${dashboard.name}" referencing field "${from}"`,
                );
            }
            tableName = matchingFilter.target.tableName;
        }

        const nameChanges = getNameChanges({
            from,
            to,
            table: tableName,
            type,
        });

        switch (type) {
            case RenameType.MODEL: {
                const [dashToResult, dashFromResult] = await Promise.allSettled(
                    [
                        this.projectModel.getExploreFromCache(projectUuid, to),
                        this.projectModel.getExploreFromCache(
                            projectUuid,
                            from,
                        ),
                    ],
                );
                if (
                    dashToResult.status === 'rejected' &&
                    dashFromResult.status === 'rejected'
                ) {
                    throw new NotFoundError(
                        `Neither "${from}" nor "${to}" explores exist in the project.`,
                    );
                }
                break;
            }
            case RenameType.FIELD: {
                const explore = await this.findExploreForField({
                    projectUuid,
                    fieldName: to,
                    model: tableName,
                    isFullId: true,
                });
                this.logger.info(
                    `Replacing field "${from}" with "${to}" on dashboard "${dashboard.name}" from explore "${explore.name}"`,
                );
                break;
            }
            default:
                assertUnreachable(type, `Unexpected rename type ${type}`);
        }

        const { updatedDashboard, hasChanges } = renameDashboard(
            type,
            dashboard,
            nameChanges,
            true, // validate
        );

        if (hasChanges) {
            await this.dashboardModel.addVersion(
                dashboard.uuid,
                updatedDashboard,
                { userUuid: user.userUuid },
                projectUuid,
            );
        }

        this.analytics.track({
            event: 'rename_dashboard_filter.executed',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context,
                dryRun: false,
                type,
                ...nameChanges,
                dashboardId: dashboard.uuid,
            },
        });

        if (fixAll) {
            this.logger.debug(
                `Scheduling a rename of all resources for ${JSON.stringify(
                    nameChanges,
                )}`,
            );
            const { jobId } = await this.scheduleRenameResources({
                context,
                dryRun: false,
                user,
                projectUuid,
                type,
                model: tableName,
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
        const auditedAbility = this.createAuditedAbility(user);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    uuid: '',
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

    async previewRenameResources({
        user,
        projectUuid,
        context,
        ...renameBody
    }: ApiRenameBody & {
        user: SessionUser;
        projectUuid: string;
        context: RequestMethod;
    }): Promise<ApiRenameResponse['results']> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
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

        // Pre-compute nameChanges so runScheduledRenameResources takes
        // the fast path and doesn't need to look up the (possibly broken)
        // field in the explore cache.
        const { from, to, type, model } = renameBody;
        const nameChanges =
            model && type === RenameType.FIELD
                ? getNameChanges({ from, to, table: model, type })
                : undefined;

        return this.runScheduledRenameResources({
            ...renameBody,
            ...(nameChanges && {
                fromReference: nameChanges.fromReference,
                toReference: nameChanges.toReference,
                fromFieldName: nameChanges.fromFieldName,
                toFieldName: nameChanges.toFieldName,
            }),
            dryRun: true,
            context,
            organizationUuid,
            projectUuid,
            userUuid: user.userUuid,
            schedulerUuid: undefined,
        });
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

                        let useFromExplore = true;
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
                                useFromExplore = false;
                            } catch (err) {
                                throw new NotFoundError(
                                    `Neither "${from}" nor "${to}" explores exist in the project.`,
                                );
                            }
                        }
                        exploreName = useFromExplore ? from : to;

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
                            fromReference: getFieldRef({
                                ...field,
                                name: from,
                            }),
                            toReference: getFieldRef({
                                ...field,
                                name: to,
                            }),
                            fromFieldName: from,
                            toFieldName: to,
                        };

                        this.logger.info(
                            `field.name="${field.name}", fieldInExplore="${fieldInExplore}", fromReference="${nameChanges.fromReference}", fromFieldName="${nameChanges.fromFieldName}"`,
                        );

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
            const explores =
                await this.projectModel.getAllExploresFromCache(projectUuid);
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
                this.dashboardModel.getByIdOrSlug(dashboard.uuid),
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
