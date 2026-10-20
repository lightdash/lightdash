import {
    type DepartmentTopContent,
    type DepartmentTopContentItem,
} from '@lightdash/common';
import { Knex } from 'knex';

export type ActivityRow = { userUuid: string; weekStart: string };

export type MemberActivityRow = {
    userUuid: string;
    lastActiveAt: Date | null;
    queries30d: number;
    dashboardViews30d: number;
};

type TopContentRow = {
    id: string;
    name: string;
    count: number;
    distinct_people: number;
};

const AI_TABLES = ['ai_prompt', 'ai_thread', 'ai_agent'];

const toTopContentItem = (row: TopContentRow): DepartmentTopContentItem => ({
    id: row.id,
    name: row.name,
    count: row.count,
    distinctPeople: row.distinct_people,
});

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

    private aiTablesExist: boolean | undefined;

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

    // AI tables come from enterprise migrations and may not exist
    async hasAiTables(): Promise<boolean> {
        if (this.aiTablesExist === undefined) {
            const checks = await Promise.all(
                AI_TABLES.map((table) => this.database.schema.hasTable(table)),
            );
            this.aiTablesExist = checks.every(Boolean);
        }
        return this.aiTablesExist;
    }

    // Every read is limited to the organization in SQL as well as to the user set
    async getMemberActivity(
        organizationUuid: string,
        userUuids: string[],
        days: number,
    ): Promise<MemberActivityRow[]> {
        if (userUuids.length === 0) return [];
        const since = daysAgo(days);
        const result = await this.database.raw<{
            rows: {
                user_uuid: string;
                last_active_at: Date | null;
                queries_30d: number;
                dashboard_views_30d: number;
            }[];
        }>(
            `
            WITH q AS (
                SELECT created_by_user_uuid AS user_uuid,
                       MAX(created_at) AS last_at,
                       COUNT(*) FILTER (WHERE created_at >= ?) AS recent
                FROM query_history
                WHERE organization_uuid = ?
                  AND created_by_user_uuid = ANY(?::uuid[])
                GROUP BY created_by_user_uuid
            ),
            dv AS (
                SELECT v.user_uuid,
                       MAX(v.timestamp) AS last_at,
                       COUNT(*) FILTER (WHERE v.timestamp >= ?) AS recent
                FROM analytics_dashboard_views v
                JOIN dashboards d ON d.dashboard_uuid = v.dashboard_uuid
                JOIN spaces s ON s.space_id = d.space_id
                JOIN projects p ON p.project_id = s.project_id
                JOIN organizations o ON o.organization_id = p.organization_id
                WHERE o.organization_uuid = ?
                  AND v.user_uuid = ANY(?::uuid[])
                GROUP BY v.user_uuid
            ),
            cv AS (
                SELECT v.user_uuid, MAX(v.timestamp) AS last_at
                FROM analytics_chart_views v
                JOIN saved_queries sq ON sq.saved_query_uuid = v.chart_uuid
                JOIN projects p ON p.project_uuid = sq.project_uuid
                JOIN organizations o ON o.organization_id = p.organization_id
                WHERE o.organization_uuid = ?
                  AND v.user_uuid = ANY(?::uuid[])
                GROUP BY v.user_uuid
            )
            SELECT u.user_uuid,
                   GREATEST(q.last_at, dv.last_at, cv.last_at) AS last_active_at,
                   COALESCE(q.recent, 0)::int AS queries_30d,
                   COALESCE(dv.recent, 0)::int AS dashboard_views_30d
            FROM unnest(?::uuid[]) AS u(user_uuid)
            LEFT JOIN q ON q.user_uuid = u.user_uuid
            LEFT JOIN dv ON dv.user_uuid = u.user_uuid
            LEFT JOIN cv ON cv.user_uuid = u.user_uuid
            `,
            [
                since,
                organizationUuid,
                userUuids,
                since,
                organizationUuid,
                userUuids,
                organizationUuid,
                userUuids,
                userUuids,
            ],
        );
        return result.rows.map((r) => ({
            userUuid: r.user_uuid,
            lastActiveAt: r.last_active_at,
            queries30d: r.queries_30d,
            dashboardViews30d: r.dashboard_views_30d,
        }));
    }

    private async topDashboards(
        organizationUuid: string,
        userUuids: string[],
        since: Date,
        limit: number,
    ): Promise<DepartmentTopContentItem[]> {
        const result = await this.database.raw<{ rows: TopContentRow[] }>(
            `
            SELECT d.dashboard_uuid AS id,
                   d.name,
                   COUNT(*)::int AS count,
                   COUNT(DISTINCT v.user_uuid)::int AS distinct_people
            FROM analytics_dashboard_views v
            JOIN dashboards d ON d.dashboard_uuid = v.dashboard_uuid
            JOIN spaces s ON s.space_id = d.space_id
            JOIN projects p ON p.project_id = s.project_id
            JOIN organizations o ON o.organization_id = p.organization_id
            WHERE o.organization_uuid = ?
              AND v.user_uuid = ANY(?::uuid[])
              AND v.timestamp >= ?
              AND d.deleted_at IS NULL
            GROUP BY d.dashboard_uuid, d.name
            ORDER BY count DESC, d.name ASC
            LIMIT ?
            `,
            [organizationUuid, userUuids, since, limit],
        );
        return result.rows.map(toTopContentItem);
    }

    private async topExplores(
        organizationUuid: string,
        userUuids: string[],
        since: Date,
        limit: number,
    ): Promise<DepartmentTopContentItem[]> {
        const result = await this.database.raw<{ rows: TopContentRow[] }>(
            `
            SELECT concat(qh.project_uuid, ':', qh.metric_query->>'exploreName') AS id,
                   qh.metric_query->>'exploreName' AS name,
                   COUNT(*)::int AS count,
                   COUNT(DISTINCT qh.created_by_user_uuid)::int AS distinct_people
            FROM query_history qh
            WHERE qh.organization_uuid = ?
              AND qh.created_by_user_uuid = ANY(?::uuid[])
              AND qh.created_at >= ?
              AND qh.metric_query->>'exploreName' IS NOT NULL
            GROUP BY qh.project_uuid, qh.metric_query->>'exploreName'
            ORDER BY count DESC, name ASC
            LIMIT ?
            `,
            [organizationUuid, userUuids, since, limit],
        );
        return result.rows.map(toTopContentItem);
    }

    private async topAiAgents(
        organizationUuid: string,
        userUuids: string[],
        since: Date,
        limit: number,
    ): Promise<DepartmentTopContentItem[]> {
        if (!(await this.hasAiTables())) return [];
        const result = await this.database.raw<{ rows: TopContentRow[] }>(
            `
            SELECT a.ai_agent_uuid AS id,
                   a.name,
                   COUNT(*)::int AS count,
                   COUNT(DISTINCT pr.created_by_user_uuid)::int AS distinct_people
            FROM ai_prompt pr
            JOIN ai_thread t ON t.ai_thread_uuid = pr.ai_thread_uuid
            JOIN ai_agent a ON a.ai_agent_uuid = t.agent_uuid
            WHERE t.organization_uuid = ?
              AND a.organization_uuid = ?
              AND pr.created_by_user_uuid = ANY(?::uuid[])
              AND pr.created_at >= ?
              AND NOT pr.hidden
            GROUP BY a.ai_agent_uuid, a.name
            ORDER BY count DESC, a.name ASC
            LIMIT ?
            `,
            [organizationUuid, organizationUuid, userUuids, since, limit],
        );
        return result.rows.map(toTopContentItem);
    }

    async getTopContent(
        organizationUuid: string,
        userUuids: string[],
        days: number,
        limit: number,
    ): Promise<DepartmentTopContent> {
        if (userUuids.length === 0) {
            return { dashboards: [], explores: [], aiAgents: [] };
        }
        const since = daysAgo(days);
        const [dashboards, explores, aiAgents] = await Promise.all([
            this.topDashboards(organizationUuid, userUuids, since, limit),
            this.topExplores(organizationUuid, userUuids, since, limit),
            this.topAiAgents(organizationUuid, userUuids, since, limit),
        ]);
        return { dashboards, explores, aiAgents };
    }
}
