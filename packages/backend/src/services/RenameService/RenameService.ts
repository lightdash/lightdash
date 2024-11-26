import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    ChartSummary,
    DashboardDAO,
    ForbiddenError,
    isChartTile,
    NotFoundError,
    ParameterError,
    PromotedChart as PromotedChangeChart,
    PromotedSpace,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    SpaceShare,
    SpaceSummary,
    UnexpectedServerError,
} from '@lightdash/common';
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

type RenameServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    schedulerModel: SchedulerModel;
    schedulerClient: SchedulerClient;
};

export class RenameService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly savedChartModel: SavedChartModel;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly dashboardModel: DashboardModel;

    private readonly schedulerModel: SchedulerModel;

    private readonly schedulerClient: SchedulerClient;

    constructor(args: RenameServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.savedChartModel = args.savedChartModel;
        this.projectModel = args.projectModel;
        this.dashboardModel = args.dashboardModel;
        this.schedulerModel = args.schedulerModel;
        this.schedulerClient = args.schedulerClient;
    }

    async scheduleRenameModel(
        user: SessionUser,
        projectUuid: string,
        oldModel: string,
        newModel: string,
        preview: boolean,
    ) {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }
        // TODO permission check
        await this.schedulerClient.renameModel({
            createdByUserUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
            projectUuid,
            oldModel,
            newModel,
            preview,
        });

        // TODO return jobIdq
    }

    /*
    This method is triggered by the scheduler
    */
    async renameModel(
        projectUuid: string,
        oldModel: string,
        newModel: string,
        preview: boolean,
    ) {
        await this.savedChartModel.find({ projectUuid });
    }
}
