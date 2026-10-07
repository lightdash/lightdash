import { Knex } from 'knex';

export type ActivityRow = { userUuid: string; weekStart: string };

type Deps = { database: Knex };

const daysAgo = (days: number): Date => {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    return since;
};

// Caller contract: userUuids must be built from one organization's members only; the view tables have no organization column, so the user set is their only scope.
const activityUnion = (
    organizationUuid: string,
    userUuids: string[],
    since: Date,
): { sql: string; bindings: Knex.RawBinding[] } => ({
    sql: `
        SELECT created_by_user_uuid AS user_uuid, created_at AS at
        FROM query_history
        WHERE organization_uuid = ?
          AND created_by_user_uuid = ANY(?::uuid[])
          AND created_at >= ?
        UNION ALL
        SELECT user_uuid, timestamp AS at FROM analytics_chart_views
        WHERE user_uuid = ANY(?::uuid[]) AND timestamp >= ?
        UNION ALL
        SELECT user_uuid, timestamp AS at FROM analytics_dashboard_views
        WHERE user_uuid = ANY(?::uuid[]) AND timestamp >= ?
    `,
    bindings: [
        organizationUuid,
        userUuids,
        since,
        userUuids,
        since,
        userUuids,
        since,
    ],
});

export class DepartmentAnalyticsModel {
    protected readonly database: Knex;

    constructor({ database }: Deps) {
        this.database = database;
    }

    async getWeeklyActivity(
        organizationUuid: string,
        userUuids: string[],
        weeks: number,
    ): Promise<ActivityRow[]> {
        if (userUuids.length === 0) return [];
        const union = activityUnion(
            organizationUuid,
            userUuids,
            daysAgo(weeks * 7),
        );
        const result = await this.database.raw<{
            rows: { user_uuid: string; week_start: string }[];
        }>(
            `SELECT DISTINCT user_uuid,
                    to_char(date_trunc('week', at), 'YYYY-MM-DD') AS week_start
             FROM (${union.sql}) a`,
            union.bindings,
        );
        return result.rows.map((r) => ({
            userUuid: r.user_uuid,
            weekStart: r.week_start,
        }));
    }

    async getActiveUserUuids(
        organizationUuid: string,
        userUuids: string[],
        days: number,
    ): Promise<string[]> {
        if (userUuids.length === 0) return [];
        const union = activityUnion(organizationUuid, userUuids, daysAgo(days));
        const result = await this.database.raw<{
            rows: { user_uuid: string }[];
        }>(`SELECT DISTINCT user_uuid FROM (${union.sql}) a`, union.bindings);
        return result.rows.map((r) => r.user_uuid);
    }
}
