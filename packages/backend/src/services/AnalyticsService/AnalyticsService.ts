import { subject } from '@casl/ability';
import {
    ChartType,
    countTotalFilterRules,
    CreateSavedChart,
    CreateSavedChartVersion,
    ForbiddenError,
    SavedChart,
    SessionUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { CreateSavedChartOrVersionEvent } from '../../analytics/LightdashAnalytics';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type Dependencies = {
    analyticsModel: AnalyticsModel;
};

export class AnalyticsService {
    private readonly analyticsModel: AnalyticsModel;

    constructor(dependencies: Dependencies) {
        this.analyticsModel = dependencies.analyticsModel;
    }

    async getChartViews(chartUuid: string): Promise<number> {
        return this.analyticsModel.countChartViews(chartUuid);
    }

    async getDashboardViews(dashboardUuid: string): Promise<number> {
        return this.analyticsModel.countDashboardViews(dashboardUuid);
    }

    async getUserActivity(
        projectUuid: string,
        user: SessionUser,
    ): Promise<any> {
        return this.analyticsModel.getUserActivity(
            projectUuid,
            user.organizationUuid,
        );
    }
}
