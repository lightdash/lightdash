import { ForbiddenError, SessionUser } from '@lightdash/common';
import { AnalyticsModel } from '../../models/AnalyticsModel';

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
        if (user.ability.cannot('view', 'Analytics')) {
            throw new ForbiddenError();
        }
        return this.analyticsModel.getUserActivity(
            projectUuid,
            user.organizationUuid,
        );
    }
}
