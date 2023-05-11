import { subject } from '@casl/ability';
import {
    ApiValidateResponse,
    CompiledField,
    Dashboard,
    fieldId as getFieldId,
    ForbiddenError,
    getFilterRules,
    isChartScheduler,
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
};

export class ValidationService {
    lightdashConfig: LightdashConfig;

    validationModel: ValidationModel;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    constructor({
        lightdashConfig,
        validationModel,
        projectModel,
        savedChartModel,
    }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.validationModel = validationModel;
    }

    async validate(user: SessionUser, projectUuid: string): Promise<any> {
        // TODO check permissions
        const exploresSummaries = await this.projectModel.getExploresFromCache(
            projectUuid,
        );

        const existingFields = exploresSummaries?.reduce<CompiledField[]>(
            (acc, exploreSummary) => {
                if (!exploreSummary.tables) return acc;

                const fields = Object.values(exploreSummary.tables).flatMap(
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
        // TODO dashboards

        // TODO get space uuids from charts and dashboards and check if "developer" has access to them
        // Don't do it for admins

        const results: ValidationResponse[] = charts.flatMap((chart) => {
            const filterAdditionalMetrics = (metric: string) =>
                !chart.metricQuery.additionalMetrics
                    ?.map((additionalMetric) => getFieldId(additionalMetric))
                    ?.includes(metric);

            const hasAccess = true; // TODO: hasSpaceAccess(chartuuid)
            const commonValidation = {
                createdAt: new Date(),
                name: hasAccess ? chart.name : 'Private content',
                chartUuid: chart.uuid,
                table: chart.tableName,
                projectUuid: chart.projectUuid,
                lastUpdatedBy: `${chart.updatedByUser?.firstName} ${chart.updatedByUser?.lastName}`,
            };
            const dimensionErrors = chart.metricQuery.dimensions.reduce<
                ValidationResponse[]
            >((acc, field) => {
                if (!existingDimensionIds?.includes(field)) {
                    return [
                        ...acc,
                        {
                            ...commonValidation,
                            summary: `dimension not found ${field}`,
                            error: `dimension not found ${field}`,
                        },
                    ];
                }
                return acc;
            }, []);
            const metricErrors = chart.metricQuery.metrics
                .filter(filterAdditionalMetrics)
                .reduce<ValidationResponse[]>((acc, field) => {
                    if (!existingMetricIds?.includes(field)) {
                        return [
                            ...acc,
                            {
                                ...commonValidation,
                                summary: `metric not found ${field}`,
                                error: `metric not found ${field}`,
                            },
                        ];
                    }
                    return acc;
                }, []);

            const filterErrors = getFilterRules(
                chart.metricQuery.filters,
            ).reduce<ValidationResponse[]>((acc, field) => {
                if (!existingFieldIds?.includes(field.target.fieldId)) {
                    return [
                        ...acc,
                        {
                            ...commonValidation,
                            summary: `filter not found ${field}`,
                            error: `filter not found ${field}`,
                        },
                    ];
                }
                return acc;
            }, []);

            const sortErrors = chart.metricQuery.sorts.reduce<
                ValidationResponse[]
            >((acc, field) => {
                if (!existingFieldIds?.includes(field.fieldId)) {
                    return [
                        ...acc,
                        {
                            ...commonValidation,
                            summary: `sort not found ${field}`,
                            error: `sort not found ${field}`,
                        },
                    ];
                }
                return acc;
            }, []);

            const parseTableField = (field: string) =>
                // Transform ${table.field} references on table calculation to table_field
                field.replace('${', '').replace('}', '').replace('.', '_');

            const tableCalculationFieldsInSql: string[] =
                chart.metricQuery.tableCalculations.reduce<string[]>(
                    (acc, tc) => {
                        const regex = /\$\{([^}]+)\}/g;

                        const fieldsInSql = tc.sql.match(regex); // regex.exec(tc.sql)
                        if (fieldsInSql != null) {
                            return [
                                ...acc,
                                ...fieldsInSql.map(parseTableField),
                            ];
                        }
                        return acc;
                    },
                    [],
                );
            const tableCalculationErrors = tableCalculationFieldsInSql.reduce<
                ValidationResponse[]
            >((acc, field) => {
                if (!existingFieldIds?.includes(field)) {
                    return [
                        ...acc,
                        {
                            ...commonValidation,
                            summary: `table calculation not found ${field}`,
                            error: `table calculation not found ${field}`,
                        },
                    ];
                }
                return acc;
            }, []);

            // TODO add more validation
            return [
                ...dimensionErrors,
                ...metricErrors,
                ...filterErrors,
                ...sortErrors,
                ...tableCalculationErrors,
            ];
        });

        await this.validationModel.delete(projectUuid);

        await this.validationModel.create(results);

        return results;
    }
}
