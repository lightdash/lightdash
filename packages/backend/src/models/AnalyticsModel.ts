import {
    OrganizationMemberRole,
    UserActivity,
    UserWithCount,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    AnalyticsChartViewsTableName,
    AnalyticsDashboardViewsTableName,
} from '../database/entities/analytics';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { UserTableName } from '../database/entities/users';
import {
    chartWeeklyAverageQueriesSql,
    chartWeeklyQueryingUsersSql,
    numberWeeklyQueryingUsersSql,
    tableMostCreatedChartsSql,
    tableMostQueriesSql,
    tableNoQueriesSql,
    usersInProjectSql,
} from './AnalyticsModelSql';

type Dependencies = {
    database: Knex;
};

type DbUserWithCount = {
    user_uuid: string;
    first_name: string;
    last_name: string;
    count: number;
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

    async addChartViewEvent(
        chartUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database(AnalyticsChartViewsTableName).insert({
            chart_uuid: chartUuid,
            user_uuid: userUuid,
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
        await this.database(AnalyticsDashboardViewsTableName).insert({
            dashboard_uuid: dashboardUuid,
            user_uuid: userUuid,
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

        const parseUsersWithCount = (
            userData: DbUserWithCount,
        ): UserWithCount => ({
            userUuid: userData.user_uuid,
            firstName: userData.first_name,
            lastName: userData.last_name,
            count: userData.count,
        });
        return {
            numberUsers: usersInProject.length,
            numberViewers: usersInProject.filter(
                (user) => user.role === OrganizationMemberRole.VIEWER,
            ).length,
            numberEditors: usersInProject.filter(
                (user) => user.role === OrganizationMemberRole.EDITOR,
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
        };
    }
}
