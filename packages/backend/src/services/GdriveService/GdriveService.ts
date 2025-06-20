import { subject } from '@casl/ability';
import {
    CustomSqlQueryForbiddenError,
    ForbiddenError,
    isCustomSqlDimension,
    SessionUser,
    UploadMetricGsheet,
    UploadMetricGsheetPayload,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';

type GdriveServiceArguments = {
    lightdashConfig: LightdashConfig;
    projectService: ProjectService;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    userModel: UserModel;
    schedulerClient: SchedulerClient;
    projectModel: ProjectModel;
};

export class GdriveService extends BaseService {
    lightdashConfig: LightdashConfig;

    projectService: ProjectService;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    userModel: UserModel;

    schedulerClient: SchedulerClient;

    projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        userModel,
        projectService,
        savedChartModel,
        dashboardModel,
        schedulerClient,
        projectModel,
    }: GdriveServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.userModel = userModel;
        this.projectService = projectService;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.schedulerClient = schedulerClient;
        this.projectModel = projectModel;
    }

    async scheduleUploadGsheet(
        user: SessionUser,
        gsheetOptions: UploadMetricGsheet,
    ) {
        const projectSummary = await this.projectModel.getSummary(
            gsheetOptions.projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid: projectSummary.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            gsheetOptions.metricQuery.customDimensions?.some(
                isCustomSqlDimension,
            ) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid: projectSummary.projectUuid,
                }),
            )
        ) {
            throw new CustomSqlQueryForbiddenError();
        }

        const { organizationUuid } = await this.projectService.getProject(
            gsheetOptions.projectUuid,
            user,
        );

        const payload: UploadMetricGsheetPayload = {
            ...gsheetOptions,
            userUuid: user.userUuid,
            organizationUuid,
        };

        const { jobId } = await this.schedulerClient.uploadGsheetFromQueryJob(
            payload,
        );

        return { jobId };
    }
}
