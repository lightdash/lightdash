import { subject } from '@casl/ability';
import {
    ApiValidateResponse,
    CompiledField,
    Dashboard,
    fieldId as getFieldId,
    ForbiddenError,
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
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { ValidationModel } from '../../models/ValidationModel/ValidationModel';
import { ProjectService } from '../ProjectService/ProjectService';

type ServiceDependencies = {
    lightdashConfig: LightdashConfig;
    validationModel: ValidationModel;
    projectService: ProjectService;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
};

export class ValidationService {
    lightdashConfig: LightdashConfig;

    validationModel: ValidationModel;

    // spaceService: SpaceService;
    projectService: ProjectService;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    constructor({
        lightdashConfig,
        validationModel,
        projectService,
        projectModel,
        savedChartModel,
    }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.projectService = projectService;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;

        this.validationModel = validationModel;
    }

    async validate(user: SessionUser, projectUuid: string): Promise<any> {
        // const project = await this.validationModel.get(projectUuid);

        // TODO we need the fields from the project to validate it
        // const exploresSummaries = await this.projectService.getAllExploresSummary(user, projectUuid, false)
        // const explorePromises = exploresSummaries.map((exploreSummary) => this.projectService.getExplore(user, projectUuid, exploreSummary.name))
        const exploresSummaries = await this.projectModel.getExploresFromCache(
            projectUuid,
        );

        // const explorePromises = exploresSummaries.map((exploreSummary) => this.projectService.getExplore(user, projectUuid, exploreSummary.name))
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

        const existingDimensionIds = existingFields
            ?.filter(isDimension)
            .map(getFieldId);
        const existingMetricIds = existingFields
            ?.filter(isMetric)
            .map(getFieldId);

        // const explores = await  Promise.all(explorePromises)

        // const fieldIds = explores.map((explore) => explore.fields.map((field) => field.id))

        // TODO charts + dashboards
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

            // TODO add more validation
            return [...dimensionErrors, ...metricErrors];
        });

        // TODO:  this.validationModel.delete(projectUuid)

        this.validationModel.create(results);

        return results;
    }
}
