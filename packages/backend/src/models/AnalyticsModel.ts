import {
    OrganizationMemberRole,
    UserActivity,
    UserWithCount,
    ViewStatistics,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Knex } from 'knex';
import {
    AnalyticsChartViewsTableName,
    AnalyticsDashboardViewsTableName,
} from '../database/entities/analytics';
import { DashboardsTableName } from '../database/entities/dashboards';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import {
    chartViewsSql,
    chartWeeklyAverageQueriesSql,
    chartWeeklyQueryingUsersSql,
    dashboardViewsSql,
    numberWeeklyQueryingUsersSql,
    tableMostCreatedChartsSql,
    tableMostQueriesSql,
    tableNoQueriesSql,
    userMostViewedDashboardSql,
    usersInProjectSql,
} from './AnalyticsModelSql';

type DbUserWithCountArguments = {
    database: Knex;
};

type DbUserWithCount = {
    user_uuid: string;
    first_name: string;
    last_name: string;
    count: number | null;
};

export class AnalyticsModel {
    private database: Knex;

    constructor(args: DbUserWithCountArguments) {
        this.database = args.database;
    }

    async getChartViewStats(chartUuid: string): Promise<ViewStatistics> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'AnalyticsModel.getChartStats',
            description: 'Gets a single chart statistics',
        });

        try {
            const stats = await this.database(AnalyticsChartViewsTableName)
                .count({ views: '*' })
                .min({
                    first_viewed_at: 'timestamp',
                })
                .where('chart_uuid', chartUuid)
                .first();

            return {
                views:
                    typeof stats?.views === 'number'
                        ? stats.views
                        : parseInt(stats?.views ?? '0', 10),
                firstViewedAt: stats?.first_viewed_at ?? new Date(),
            };
        } finally {
            span?.finish();
        }
    }

    async addChartViewEvent(
        chartUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(AnalyticsChartViewsTableName).insert({
                chart_uuid: chartUuid,
                user_uuid: userUuid,
            });
            await trx(SavedChartsTableName)
                .update({
                    // @ts-ignore
                    views_count: trx.raw('views_count + 1'),
                    // @ts-ignore
                    first_viewed_at: trx.raw(
                        'COALESCE(first_viewed_at, NOW())',
                    ), // update first_viewed_at if it is null
                    last_viewed_at: new Date(),
                })
                .where('saved_query_uuid', chartUuid);
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

    async addDashboardViewEvent(
        dashboardUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await this.database(AnalyticsDashboardViewsTableName).insert({
                dashboard_uuid: dashboardUuid,
                user_uuid: userUuid,
            });
            await trx(DashboardsTableName)
                .update({
                    // @ts-ignore
                    views_count: trx.raw('views_count + 1'),
                    // @ts-ignore
                    first_viewed_at: trx.raw(
                        'COALESCE(first_viewed_at, NOW())',
                    ), // update first_viewed_at if it is null
                    last_viewed_at: new Date(),
                })
                .where('dashboard_uuid', dashboardUuid);
        });
    }

    async getUserActivity(
        projectUuid: string,
        organizationUuid: string,
    ): Promise<UserActivity> {
        const usersInProjectQuery = await this.database.raw(
            usersInProjectSql(projectUuid, organizationUuid),
        );
        const usersInProject: { user_uuid: string; role: string }[] =
            usersInProjectQuery.rows;
        const userUuids = usersInProject.map((user) => user.user_uuid);

        const numberWeeklyQueryingUsersQuery = await this.database.raw(
            numberWeeklyQueryingUsersSql(userUuids, projectUuid),
        );
        const numberWeeklyQueryingUsers: number = parseInt(
            numberWeeklyQueryingUsersQuery.rows[0].count,
            10,
        );

        const tableMostQueries = await this.database.raw(
            tableMostQueriesSql(userUuids, projectUuid),
        );

        const tableMostCreatedCharts = await this.database.raw(
            tableMostCreatedChartsSql(userUuids, projectUuid),
        );

        const tableNoQueries = await this.database.raw(
            tableNoQueriesSql(userUuids, projectUuid),
        );

        const chartWeeklyQueryingUsers = await this.database.raw(
            chartWeeklyQueryingUsersSql(userUuids, projectUuid),
        );

        const chartWeeklyAverageQueries = await this.database.raw(
            chartWeeklyAverageQueriesSql(userUuids, projectUuid),
        );

        const dashboardViews = await this.database.raw(
            dashboardViewsSql(projectUuid),
        );

        const userMostViewedDashboards = await this.database.raw(
            userMostViewedDashboardSql(projectUuid),
        );
        const chartViews = await this.database.raw(chartViewsSql(projectUuid));
        const parseUsersWithCount = (
            userData: DbUserWithCount,
        ): UserWithCount => ({
            userUuid: userData.user_uuid,
            firstName: userData.first_name,
            lastName: userData.last_name,
            count: userData.count || undefined,
        });

        return {
            numberUsers: usersInProject.length,
            numberInteractiveViewers: usersInProject.filter(
                (user) =>
                    user.role === OrganizationMemberRole.INTERACTIVE_VIEWER,
            ).length,
            numberViewers: usersInProject.filter(
                (user) => user.role === OrganizationMemberRole.VIEWER,
            ).length,
            numberEditors: usersInProject.filter(
                (user) =>
                    user.role === OrganizationMemberRole.EDITOR ||
                    user.role === OrganizationMemberRole.DEVELOPER,
            ).length,
            numberAdmins: usersInProject.filter(
                (user) => user.role === OrganizationMemberRole.ADMIN,
            ).length,
            numberWeeklyQueryingUsers,
            tableMostQueries: tableMostQueries.rows.map(parseUsersWithCount),
            tableMostCreatedCharts:
                tableMostCreatedCharts.rows.map(parseUsersWithCount),
            tableNoQueries: tableNoQueries.rows.map(parseUsersWithCount),
            chartWeeklyQueryingUsers: chartWeeklyQueryingUsers.rows,
            chartWeeklyAverageQueries: chartWeeklyAverageQueries.rows,
            dashboardViews: dashboardViews.rows,
            userMostViewedDashboards: userMostViewedDashboards.rows.map(
                (row: any) => ({
                    userUuid: row.user_uuid,
                    firstName: row.first_name,
                    lastName: row.last_name,
                    count: row.count,
                    dashboardName: row.dashboard_name,
                }),
            ),
            chartViews: chartViews.rows,
        };
    }
}
