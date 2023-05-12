import { subject } from '@casl/ability';
import {
    ApiValidateResponse,
    CompiledField,
    Dashboard,
    Explore,
    ExploreCompiler,
    ExploreError,
    fieldId as getFieldId,
    ForbiddenError,
    getFilterRules,
    getSpaceAccessFromSummary,
    isChartScheduler,
    isDashboardChartTileType,
    isDimension,
    isExploreError,
    isMetric,
    isSlackTarget,
    isUserWithOrg,
    OrganizationMemberRole,
    ProjectMemberRole,
    SavedChart,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerLog,
    SessionUser,
    Space,
    SpaceSummary,
    TableCalculation,
    UpdateSchedulerAndTargetsWithoutId,
    ValidationResponse,
} from '@lightdash/common';
import WarehouseBaseClient from '@lightdash/warehouses/src/warehouseClients/WarehouseBaseClient';
import cronstrue from 'cronstrue';
import { analytics } from '../../analytics/client';
import { schedulerClient, slackClient } from '../../clients/clients';
import { LightdashConfig } from '../../config/parseConfig';
import { ValidationInsert } from '../../database/entities/validation';
import Logger from '../../logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { ProjectService } from '../ProjectService/ProjectService';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type ServiceDependencies = {
    lightdashConfig: LightdashConfig;
    validationModel: ValidationModel;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
};

export class ValidationService {
    lightdashConfig: LightdashConfig;

    validationModel: ValidationModel;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    constructor({
        lightdashConfig,
        validationModel,
        projectModel,
        savedChartModel,
        dashboardModel,
        spaceModel,
    }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.validationModel = validationModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
    }

    private static getTableCalculationFieldIds(
        tableCalculations: TableCalculation[],
    ): string[] {
        const parseTableField = (field: string) =>
            // Transform ${table.field} references on table calculation to table_field
            field.replace('${', '').replace('}', '').replace('.', '_');

        const tableCalculationFieldsInSql: string[] = tableCalculations.reduce<
            string[]
        >((acc, tc) => {
            const regex = /\$\{([^}]+)\}/g;

            const fieldsInSql = tc.sql.match(regex);
            if (fieldsInSql != null) {
                return [...acc, ...fieldsInSql.map(parseTableField)];
            }
            return acc;
        }, []);
        return tableCalculationFieldsInSql;
    }

    private static async validateTables(
        projectUuid: string,
        explores: (Explore | ExploreError)[] | undefined,
    ): Promise<ValidationInsert[]> {
        // Get existing errors from ExploreError and convert to ValidationInsert
        if (explores === undefined) {
            return [];
        }
        const errors = explores.reduce<ValidationInsert[]>((acc, explore) => {
            if (isExploreError(explore)) {
                const exploreErrors = explore.errors.map((ee) => ({
                    error: ee.message,
                    projectUuid,
                    dashboardUuid: null,
                    savedChartUuid: null,
                }));
                return [...acc, ...exploreErrors];
            }
            return acc;
        }, []);
        return errors;
    }

    private async validateCharts(
        projectUuid: string,
        existingFields: CompiledField[],
    ): Promise<ValidationInsert[]> {
        const existingFieldIds = existingFields.map(getFieldId);

        const existingDimensionIds = existingFields
            .filter(isDimension)
            .map(getFieldId);
        const existingMetricIds = existingFields
            .filter(isMetric)
            .map(getFieldId);
        const chartSummaries = await this.savedChartModel.find({ projectUuid });
        const charts = await Promise.all(
            chartSummaries.map((chartSummary) =>
                this.savedChartModel.get(chartSummary.uuid),
            ),
        );

        const results = charts.flatMap((chart) => {
            const filterAdditionalMetrics = (metric: string) =>
                !chart.metricQuery.additionalMetrics
                    ?.map((additionalMetric) => getFieldId(additionalMetric))
                    ?.includes(metric);

            const commonValidation = {
                savedChartUuid: chart.uuid,
                name: chart.name,
                projectUuid: chart.projectUuid,
                dashboardUuid: null,
            };
            const containsFieldId = (
                acc: ValidationInsert[],
                fieldIds: string[],
                fieldId: string,
                error: string,
            ) => {
                if (!fieldIds?.includes(fieldId)) {
                    return [
                        ...acc,
                        {
                            ...commonValidation,
                            error,
                        },
                    ];
                }
                return acc;
            };
            const dimensionErrors = chart.metricQuery.dimensions.reduce<
                ValidationInsert[]
            >(
                (acc, field) =>
                    containsFieldId(
                        acc,
                        existingDimensionIds,
                        field,
                        `Dimension error: the field '${field}' no longer exists`,
                    ),
                [],
            );
            const metricErrors = chart.metricQuery.metrics
                .filter(filterAdditionalMetrics)
                .reduce<ValidationInsert[]>(
                    (acc, field) =>
                        containsFieldId(
                            acc,
                            existingMetricIds,
                            field,
                            `Metric error: the field '${field}' no longer exists`,
                        ),
                    [],
                );

            const filterErrors = getFilterRules(
                chart.metricQuery.filters,
            ).reduce<ValidationInsert[]>(
                (acc, field) =>
                    containsFieldId(
                        acc,
                        existingFieldIds,
                        field.target.fieldId,
                        `Filter error: the field '${field.target.fieldId}' no longer exists`,
                    ),
                [],
            );

            const sortErrors = chart.metricQuery.sorts.reduce<
                ValidationInsert[]
            >(
                (acc, field) =>
                    containsFieldId(
                        acc,
                        existingFieldIds,
                        field.fieldId,
                        `Sorting error: the field '${field.fieldId}' no longer exists`,
                    ),
                [],
            );

            /*
            // I think these are redundant, as we already check dimension/metrics
            const filterTableCalculations = (metric: string) =>
                !chart.metricQuery.tableCalculations
                    ?.map((tableCalculation) => tableCalculation.name)
                    ?.includes(metric);

            const errorColumnOrder = chart.tableConfig.columnOrder
                .filter(filterTableCalculations)
                .filter(filterAdditionalMetrics)
                .reduce<ValidationResponse[]>((acc, field) => {
                    return containsFieldId(acc, existingFieldIds, field, 
                        `Table error: the field '${field}' no longer exists`, 
                        `The field '${field}' no longer exists and is being used to order table columns.`)
                }, []);
               

            const tableCalculationErrors =
                ValidationService.getTableCalculationFieldIds(
                    chart.metricQuery.tableCalculations,
                ).reduce<ValidationResponse[]>(
                    (acc, field) =>
                        containsFieldId(
                            acc,
                            existingFieldIds,
                            field,
                            `Table calculation error: the field '${field}' no longer exists`,
                            `The field '${field}' no longer exists and is being used as a table calculation.`,
                        ),
                    [],
                ); */

            return [
                ...dimensionErrors,
                ...metricErrors,
                ...filterErrors,
                ...sortErrors,
            ];
        });

        return results;
    }

    private async validateDashboards(
        projectUuid: string,
        existingFields: CompiledField[],
        brokenCharts: { uuid: string; name: string }[],
    ): Promise<ValidationInsert[]> {
        const existingFieldIds = existingFields.map(getFieldId);

        const dashboardSummaries = await this.dashboardModel.getAllByProject(
            projectUuid,
        );
        const dashboards = await Promise.all(
            dashboardSummaries.map((dashboardSummary) =>
                this.dashboardModel.getById(dashboardSummary.uuid),
            ),
        );
        const results: ValidationInsert[] = dashboards.flatMap((dashboard) => {
            const commonValidation = {
                dashboardUuid: dashboard.uuid,
                savedChartUuid: null,
                projectUuid: dashboard.projectUuid,
            };
            const containsFieldId = (
                acc: ValidationInsert[],
                fieldIds: string[],
                fieldId: string,
                error: string,
            ) => {
                if (!fieldIds?.includes(fieldId)) {
                    return [
                        ...acc,
                        {
                            ...commonValidation,
                            error,
                        },
                    ];
                }
                return acc;
            };
            const dashboardFilterRules = [
                ...dashboard.filters.dimensions,
                ...dashboard.filters.metrics,
            ];
            const filterErrors = dashboardFilterRules.reduce<
                ValidationInsert[]
            >(
                (acc, filter) =>
                    containsFieldId(
                        acc,
                        existingFieldIds,
                        filter.target.fieldId,
                        `Filter error: the field '${filter}' no longer exists`,
                    ),
                [],
            );

            const chartTiles = dashboard.tiles.filter(isDashboardChartTileType);
            const chartErrors = chartTiles.reduce<ValidationInsert[]>(
                (acc, chart) => {
                    const brokenChart = brokenCharts.find(
                        (c) => c.uuid === chart.properties.savedChartUuid,
                    );
                    if (brokenChart !== undefined) {
                        return [
                            ...acc,
                            {
                                ...commonValidation,
                                error: `The chart '${brokenChart.name}' is broken on this dashboard.`,
                            },
                        ];
                    }
                    return acc;
                },
                [],
            );
            return [...filterErrors, ...chartErrors];
        });

        return results;
    }

    async generateValidation(projectUuid: string): Promise<ValidationInsert[]> {
        const explores = await this.projectModel.getExploresFromCache(
            projectUuid,
        );

        const existingFields = explores?.reduce<CompiledField[]>(
            (acc, explore) => {
                if (!explore.tables) return acc;

                const fields = Object.values(explore.tables).flatMap(
                    (table) => [
                        ...Object.values(table.dimensions),
                        ...Object.values(table.metrics),
                    ],
                );

                return [...acc, ...fields];
            },
            [],
        );

        if (!existingFields) {
            Logger.warn(
                `No fields found for project validation ${projectUuid}`,
            );
            return [];
        }

        const tableErrors = await ValidationService.validateTables(
            projectUuid,
            explores,
        );
        const chartErrors = await this.validateCharts(
            projectUuid,
            existingFields,
        );
        const dashboardErrors = await this.validateDashboards(
            projectUuid,
            existingFields,
            chartErrors.map((c) => ({
                uuid: c.savedChartUuid!,
                name: c.name!,
            })),
        );
        const validationErrors = [
            ...tableErrors,
            ...chartErrors,
            ...dashboardErrors,
        ];
        return validationErrors;
    }

    async validate(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ValidationResponse[]> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const validationErrors = await this.generateValidation(projectUuid);
        await this.validationModel.delete(projectUuid);

        if (validationErrors.length > 0)
            await this.validationModel.create(validationErrors);

        const validations = await this.validationModel.get(projectUuid);
        return this.hidePrivateContent(user, projectUuid, validations);
    }

    async hidePrivateContent(
        user: SessionUser,
        projectUuid: string,
        validations: ValidationResponse[],
    ): Promise<ValidationResponse[]> {
        if (user.role === OrganizationMemberRole.ADMIN) return validations;

        const spaces = await this.spaceModel.find({ projectUuid });
        // Filter private content to developers
        return validations.map((validation) => {
            const space = spaces.find((s) => s.uuid === validation.spaceUuid);
            const hasAccess =
                space &&
                hasSpaceAccess(getSpaceAccessFromSummary(space), user.userUuid);
            if (hasAccess) return validation;

            return { ...validation, name: 'Private content' };
        });
    }

    async get(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ValidationResponse[]> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Validation', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const validations = await this.validationModel.get(projectUuid);
        return this.hidePrivateContent(user, projectUuid, validations);
    }
}
