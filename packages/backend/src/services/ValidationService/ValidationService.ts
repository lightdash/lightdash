import { subject } from '@casl/ability';
import {
    ApiValidateResponse,
    CompiledField,
    Dashboard,
    fieldId as getFieldId,
    ForbiddenError,
    getFilterRules,
    isChartScheduler,
    isDashboardChartTileType,
    isDimension,
    isMetric,
    isSlackTarget,
    isUserWithOrg,
    SavedChart,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerLog,
    SessionUser,
    TableCalculation,
    UpdateSchedulerAndTargetsWithoutId,
    ValidationResponse,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { analytics } from '../../analytics/client';
import { schedulerClient, slackClient } from '../../clients/clients';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { ProjectService } from '../ProjectService/ProjectService';

type ServiceDependencies = {
    lightdashConfig: LightdashConfig;
    validationModel: ValidationModel;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
};

export class ValidationService {
    lightdashConfig: LightdashConfig;

    validationModel: ValidationModel;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    constructor({
        lightdashConfig,
        validationModel,
        projectModel,
        savedChartModel,
        dashboardModel,
    }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.validationModel = validationModel;
        this.dashboardModel = dashboardModel;
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

            const fieldsInSql = tc.sql.match(regex); // regex.exec(tc.sql)
            if (fieldsInSql != null) {
                return [...acc, ...fieldsInSql.map(parseTableField)];
            }
            return acc;
        }, []);
        return tableCalculationFieldsInSql;
    }

    private async validateCharts(
        projectUuid: string,
        existingFields: CompiledField[],
    ): Promise<ValidationResponse[]> {
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

        const results: ValidationResponse[] = charts.flatMap((chart) => {
            const filterAdditionalMetrics = (metric: string) =>
                !chart.metricQuery.additionalMetrics
                    ?.map((additionalMetric) => getFieldId(additionalMetric))
                    ?.includes(metric);
            const filterTableCalculations = (metric: string) =>
                !chart.metricQuery.tableCalculations
                    ?.map((tableCalculation) => tableCalculation.name)
                    ?.includes(metric);

            const hasAccess = true; // TODO: hasSpaceAccess(chartuuid)
            const commonValidation = {
                createdAt: new Date(),
                name: hasAccess ? chart.name : 'Private content',
                chartUuid: chart.uuid,
                table: chart.tableName,
                projectUuid: chart.projectUuid,
                lastUpdatedBy: `${chart.updatedByUser?.firstName} ${chart.updatedByUser?.lastName}`,
                lastUpdatedAt: chart.updatedAt,
            };
            const containsFieldId = (
                acc: ValidationResponse[],
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
                ValidationResponse[]
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
                .reduce<ValidationResponse[]>(
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
            ).reduce<ValidationResponse[]>(
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
                ValidationResponse[]
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
    ): Promise<ValidationResponse[]> {
        const existingFieldIds = existingFields.map(getFieldId);

        const existingDimensionIds = existingFields
            .filter(isDimension)
            .map(getFieldId);
        const existingMetricIds = existingFields
            .filter(isMetric)
            .map(getFieldId);
        const dashboardSummaries = await this.dashboardModel.getAllByProject(
            projectUuid,
        );
        const dashboards = await Promise.all(
            dashboardSummaries.map((dashboardSummary) =>
                this.dashboardModel.getById(dashboardSummary.uuid),
            ),
        );
        const results: ValidationResponse[] = dashboards.flatMap(
            (dashboard) => {
                const hasAccess = true; // TODO: hasSpaceAccess(chartuuid)
                const commonValidation = {
                    createdAt: new Date(),
                    name: hasAccess ? dashboard.name : 'Private content',
                    dashboardUuid: dashboard.uuid,
                    projectUuid: dashboard.projectUuid,
                    lastUpdatedBy: `${dashboard.updatedByUser?.firstName} ${dashboard.updatedByUser?.lastName}`,
                    lastUpdatedAt: dashboard.updatedAt,
                };
                const containsFieldId = (
                    acc: ValidationResponse[],
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
                    ValidationResponse[]
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

                const chartTiles = dashboard.tiles.filter(
                    isDashboardChartTileType,
                );
                const chartErrors = chartTiles.reduce<ValidationResponse[]>(
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
            },
        );

        return results;
    }

    async validate(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ValidationResponse[]> {
        // TODO check permissions
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

        // TODO get space uuids from charts and dashboards and check if "developer" has access to them
        // Don't do it for admins

        const chartErrors = await this.validateCharts(
            projectUuid,
            existingFields,
        );
        const dashboardErrors = await this.validateDashboards(
            projectUuid,
            existingFields,
            chartErrors.map((c) => ({ uuid: c.chartUuid!, name: c.name })),
        );
        const validationErrors = [...chartErrors, ...dashboardErrors];
        await this.validationModel.delete(projectUuid);

        if (validationErrors.length > 0)
            await this.validationModel.create(validationErrors);

        return validationErrors;
    }
}
