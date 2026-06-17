import { subject } from '@casl/ability';
import {
    Account,
    CustomSqlQueryForbiddenError,
    ForbiddenError,
    GoogleNotConnectedError,
    isCustomSqlDimension,
    NotFoundError,
    ParameterError,
    UPLOAD_GSHEET_FROM_ROWS_MAX_ROWS,
    UploadGsheetFromRows,
    UploadGsheetFromRowsPayload,
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
        account: Account,
        gsheetOptions: UploadMetricGsheet,
    ) {
        const projectSummary = await this.projectModel.getSummary(
            gsheetOptions.projectUuid,
        );
        const auditedAbility = this.createAuditedAbility(account);
        const projectMetadata = {
            projectUuid: projectSummary.projectUuid,
            projectName: projectSummary.name,
        };
        if (
            auditedAbility.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid: projectSummary.projectUuid,
                    metadata: projectMetadata,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
                'manage',
                subject('GoogleSheets', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid: projectSummary.projectUuid,
                    metadata: projectMetadata,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { organizationUuid } = await this.projectService.getProject(
            gsheetOptions.projectUuid,
            account,
        );

        const payload: UploadMetricGsheetPayload = {
            ...gsheetOptions,
            userUuid: account.user.id,
            organizationUuid,
            source: 'metricQuery',
        };

        const { jobId } =
            await this.schedulerClient.uploadGsheetFromQueryJob(payload);

        return { jobId };
    }

    async scheduleUploadGsheetFromRows(
        account: Account,
        options: UploadGsheetFromRows,
    ) {
        const projectSummary = await this.projectModel.getSummary(
            options.projectUuid,
        );
        const auditedAbility = this.createAuditedAbility(account);
        const projectMetadata = {
            projectUuid: projectSummary.projectUuid,
            projectName: projectSummary.name,
        };

        if (
            auditedAbility.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid: projectSummary.projectUuid,
                    metadata: projectMetadata,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
                'manage',
                subject('GoogleSheets', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid: projectSummary.projectUuid,
                    metadata: projectMetadata,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (options.rows.length > UPLOAD_GSHEET_FROM_ROWS_MAX_ROWS) {
            throw new ParameterError(
                `Export too large (max ${UPLOAD_GSHEET_FROM_ROWS_MAX_ROWS} rows)`,
            );
        }

        try {
            await this.userModel.getRefreshToken(account.user.id);
        } catch (e) {
            if (e instanceof NotFoundError) {
                throw new GoogleNotConnectedError(
                    'Google account not connected',
                );
            }
            throw e;
        }

        const payload: UploadGsheetFromRowsPayload = {
            ...options,
            userUuid: account.user.id,
            organizationUuid: projectSummary.organizationUuid,
            source: 'rows',
        };

        const { jobId } =
            await this.schedulerClient.uploadGsheetFromRowsJob(payload);

        return { jobId };
    }
}
