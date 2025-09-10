import {
    OrganizationMemberRole,
    UnusedContent,
    UnusedContentItem,
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
import { ProjectTableName } from '../database/entities/projects';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import {
    chartViewsSql,
    chartWeeklyAverageQueriesSql,
    chartWeeklyQueryingUsersSql,
    dashboardViewsSql,
    numberWeeklyQueryingUsersSql,
    tableMostCreatedChartsSql,
    tableMostQueriesSql,
    tableNoQueriesSql,
    unusedChartsSql,
    unusedDashboardsSql,
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
        return Sentry.startSpan(
            {
                op: 'AnalyticsModel.getChartStats',
                name: 'AnalyticsModel.getChartStats',
            },
            async () => {
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
            },
        );
    }

    async addChartViewEvent(
        chartUuid: string,
        userUuid: string | null,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(AnalyticsChartViewsTableName).insert({
                chart_uuid: chartUuid,
                user_uuid: userUuid,
            });
            await trx(SavedChartsTableName)
                .update({
                    views_count: trx.raw(
                        'views_count + 1',
                    ) as unknown as number,
                    first_viewed_at: trx.raw(
                        'COALESCE(first_viewed_at, NOW())',
                    ) as unknown as Date, // update first_viewed_at if it is null
                })
                .where('saved_query_uuid', chartUuid);
        });
    }

    async addSqlChartViewEvent(
        sqlChartUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // TODO add sql views table for tracking user views
            /*  await trx(AnalyticsSqlChartViewsTableName).insert({
                chart_uuid: chartUuid,
                user_uuid: userUuid,
            }); */
            await trx(`saved_sql`)
                .update({
                    views_count: trx.raw(
                        'views_count + 1',
                    ) as unknown as number,
                    first_viewed_at: trx.raw(
                        'COALESCE(first_viewed_at, NOW())',
                    ) as unknown as Date,
                    last_viewed_at: trx.raw('NOW()') as unknown as Date,
                })
                .where('saved_sql_uuid', sqlChartUuid);
        });
    }

    async countDashboardViews(dashboardUuid: string): Promise<number> {
        const [{ count }] = await this.database(
            AnalyticsDashboardViewsTableName,
        )
            .select('count')
            .count('dashboard_uuid')
            .where('dashboard_uuid', dashboardUuid);

        return Number(count);
    }

    async addDashboardViewEvent(
        dashboardUuid: string,
        userUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(AnalyticsDashboardViewsTableName).insert({
                dashboard_uuid: dashboardUuid,
                user_uuid: userUuid,
            });
            await trx(DashboardsTableName)
                .update({
                    views_count: trx.raw(
                        'views_count + 1',
                    ) as unknown as number,
                    first_viewed_at: trx.raw(
                        'COALESCE(first_viewed_at, NOW())',
                    ) as unknown as Date, // update first_viewed_at if it is null
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

        const userMostViewedDashboards = await this.database.raw<{
            rows: {
                user_uuid: string;
                first_name: string;
                last_name: string;
                dashboard_name: string;
                count: number;
            }[];
        }>(userMostViewedDashboardSql(projectUuid));
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
                (row) => ({
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

    /**
     * Returns a list of rows with dashboards and chart views
     * we include the details like dashboard/chart names, user names
     * filtered by projectUuid
     * order by timestamp desc
     * @param projectUuid
     * @returns
     */
    async getViewsRawData(projectUuid: string) {
        type RawViewType = {
            type: 'chart' | 'dashboard';
            timestamp: string; // Convert to ISO string in database
            uuid: string;
            name: string;
            user_uuid: string;
            user_first_name: string;
            user_last_name: string;
            space_name: string;
        };
        const results = await this.database.transaction(async (trx) => {
            const chartViews = trx
                .select<RawViewType[]>(
                    this.database.raw(`'chart' as type`),
                    this.database.raw(
                        `to_char(${AnalyticsChartViewsTableName}.timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as timestamp`,
                    ),
                    `${SavedChartsTableName}.saved_query_uuid as uuid`,
                    `${SavedChartsTableName}.name as name`,
                    `${UserTableName}.user_uuid as user_uuid`,
                    `${UserTableName}.first_name as user_first_name`,
                    `${UserTableName}.last_name as user_last_name`,
                    `${SpaceTableName}.name as space_name`,
                )
                .from(AnalyticsChartViewsTableName)
                .leftJoin(
                    SavedChartsTableName,
                    `${SavedChartsTableName}.saved_query_uuid`,
                    `${AnalyticsChartViewsTableName}.chart_uuid`,
                )
                .leftJoin(
                    UserTableName,
                    `${UserTableName}.user_uuid`,
                    `${AnalyticsChartViewsTableName}.user_uuid`,
                )
                .leftJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${SavedChartsTableName}.space_id`,
                )
                .leftJoin(
                    ProjectTableName,
                    `${ProjectTableName}.project_id`,
                    `${SpaceTableName}.project_id`,
                )
                .where(`${ProjectTableName}.project_uuid`, projectUuid);

            const dashboardViews = trx
                .select<RawViewType[]>(
                    this.database.raw(`'dashboard' as type`),
                    this.database.raw(
                        `to_char(${AnalyticsDashboardViewsTableName}.timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as timestamp`,
                    ),
                    `${DashboardsTableName}.dashboard_uuid as uuid`,
                    `${DashboardsTableName}.name as name`,
                    `${UserTableName}.user_uuid as user_uuid`,
                    `${UserTableName}.first_name as user_first_name`,
                    `${UserTableName}.last_name as user_last_name`,
                    `${SpaceTableName}.name as space_name`,
                )
                .from(AnalyticsDashboardViewsTableName)
                .leftJoin(
                    DashboardsTableName,
                    `${DashboardsTableName}.dashboard_uuid`,
                    `${AnalyticsDashboardViewsTableName}.dashboard_uuid`,
                )
                .leftJoin(
                    UserTableName,
                    `${UserTableName}.user_uuid`,
                    `${AnalyticsDashboardViewsTableName}.user_uuid`,
                )
                .leftJoin(
                    SpaceTableName,
                    `${SpaceTableName}.space_id`,
                    `${DashboardsTableName}.space_id`,
                )
                .leftJoin(
                    ProjectTableName,
                    `${ProjectTableName}.project_id`,
                    `${SpaceTableName}.project_id`,
                )
                .where(`${ProjectTableName}.project_uuid`, projectUuid);

            return chartViews
                .union(dashboardViews)
                .orderBy('timestamp', 'desc')
                .limit(100000); // hard limit to avoid memory issues
        });

        return results;
    }

    async getUnusedContent(projectUuid: string): Promise<UnusedContent> {
        return Sentry.startSpan(
            {
                op: 'AnalyticsModel.getUnusedContent',
                name: 'AnalyticsModel.getUnusedContent',
            },
            async () => {
                const chartsQuery = unusedChartsSql();
                const dashboardsQuery = unusedDashboardsSql();

                const [chartsResults, dashboardsResults] = await Promise.all([
                    this.database.raw(chartsQuery, [projectUuid]),
                    this.database.raw(dashboardsQuery, [projectUuid]),
                ]);

                const charts: UnusedContentItem[] = chartsResults.rows.map(
                    (row: Record<string, unknown>) => ({
                        lastViewedAt: row.last_viewed_at as Date | null,
                        lastViewedByUserUuid: row.last_viewed_by_user_uuid as
                            | string
                            | null,
                        lastViewedByUserName: row.last_viewed_by_user_name as
                            | string
                            | null,
                        createdByUserUuid: String(
                            row.created_by_user_uuid || '',
                        ),
                        createdByUserName: String(
                            row.created_by_user_name || '',
                        ),
                        createdAt: row.created_at as Date,
                        contentUuid: String(row.content_uuid || ''),
                        contentName: String(row.content_name || ''),
                        contentType: 'chart' as const,
                        viewsCount: Number(row.views_count) || 0,
                    }),
                );

                const dashboards: UnusedContentItem[] =
                    dashboardsResults.rows.map(
                        (row: Record<string, unknown>) => ({
                            lastViewedAt: row.last_viewed_at as Date | null,
                            lastViewedByUserUuid:
                                row.last_viewed_by_user_uuid as string | null,
                            lastViewedByUserName:
                                row.last_viewed_by_user_name as string | null,
                            createdByUserUuid: String(
                                row.created_by_user_uuid || '',
                            ),
                            createdByUserName: String(
                                row.created_by_user_name || '',
                            ),
                            createdAt: row.created_at as Date,
                            contentUuid: String(row.content_uuid || ''),
                            contentName: String(row.content_name || ''),
                            contentType: 'dashboard' as const,
                            viewsCount: Number(row.views_count) || 0,
                        }),
                    );

                return { charts, dashboards };
            },
        );
    }
}
