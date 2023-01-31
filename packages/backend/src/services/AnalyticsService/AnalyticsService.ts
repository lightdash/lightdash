import { ForbiddenError, SessionUser } from '@lightdash/common';
import { analytics } from '../../analytics/client';
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

        analytics.track({
            event: 'usage_analytics.dashboard_viewed',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                dashboardType: 'user_activity',
            },
        });

        return this.analyticsModel.getUserActivity(
            projectUuid,
            user.organizationUuid,
        );
    }
}
