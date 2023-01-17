import { Knex } from 'knex';
import {
    AnalyticsChartViewsTableName,
    AnalyticsDashboardViewsTableName,
} from '../database/entities/analytics';

type Dependencies = {
    database: Knex;
};
export class AnalyticsModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async countChartViews(chartUuid: string): Promise<number> {
        const [{ count }] = await this.database(AnalyticsChartViewsTableName)
            .count('chart_uuid')
            .where('chart_uuid', chartUuid);

        return Number(count);
    }

    async trackChartView(chartUuid: string, userUuid: string): Promise<void> {
        await this.database(AnalyticsChartViewsTableName).insert({
            chart_uuid: chartUuid,
            user_uuid: userUuid,
            context: {},
        });
    }

    async countDashboardViews(dashboardUuid: string): Promise<number> {
        const [{ count }] = await this.database(
            AnalyticsDashboardViewsTableName,
        )
            .count('dashboard_uuid')
            .where('dashboard_uuid', dashboardUuid);

        return Number(count);
    }

    async trackDashboardView(
        dashboardUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database(AnalyticsDashboardViewsTableName).insert({
            dashboard_uuid: dashboardUuid,
            user_uuid: userUuid,
            context: {},
        });
    }
}
