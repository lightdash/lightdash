import {
    QueryExecutionContext,
    type DepartmentTopContent,
    type DepartmentTopContentItem,
} from '@lightdash/common';
import { Knex } from 'knex';
import { queryWorkloadOrigin } from '../services/AsyncQueryService/queryUsage';

export type ActivityRow = { userUuid: string; weekStart: string };

// One clock per request, so every read in it shares the same rolling bounds
export type ActivityWindows = { activeSince: Date; trendSince: Date };

export type ActivitySnapshot = {
    activeUserUuids: string[]; // active since activeSince
    weeklyActivity: ActivityRow[]; // one row per person per UTC week since trendSince
};

export type MemberActivityRow = {
    userUuid: string;
    lastActiveAt: Date | null;
    isActive30d: boolean;
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

// Only queries a person ran count as activity; schedules, alerts, syncs, API, agent and MCP runs do not
export const INTERACTIVE_QUERY_CONTEXTS: QueryExecutionContext[] =
    Object.values(QueryExecutionContext).filter(
        (context) => queryWorkloadOrigin(context) === 'interactive',
    );

const toTopContentItem = (row: TopContentRow): DepartmentTopContentItem => ({
    id: row.id,
    name: row.name,
    count: row.count,
    distinctPeople: row.distinct_people,
});

type Deps = { database: Knex };

// The view tables have no organization column, so they are tied to it through the content viewed
const activityUnion = (
    organizationUuid: string,
    userUuids: string[],
    since: Date,
): { sql: string; bindings: Knex.RawBinding[] } => ({
    sql: `
        SELECT qh.created_by_user_uuid AS user_uuid, qh.created_at AS at
        FROM query_history qh
        WHERE qh.organization_uuid = ?
          AND qh.created_by_user_uuid = ANY(?::uuid[])
          AND qh.context = ANY(?::text[])
          AND qh.created_at >= ?
        UNION ALL
        SELECT v.user_uuid, v.timestamp AS at
        FROM analytics_chart_views v
        JOIN saved_queries sq ON sq.saved_query_uuid = v.chart_uuid
        JOIN projects p ON p.project_uuid = sq.project_uuid
        JOIN organizations o ON o.organization_id = p.organization_id
        WHERE o.organization_uuid = ?
          AND v.user_uuid = ANY(?::uuid[])
          AND v.timestamp >= ?
        UNION ALL
        SELECT v.user_uuid, v.timestamp AS at
        FROM analytics_dashboard_views v
        JOIN dashboards d ON d.dashboard_uuid = v.dashboard_uuid
        JOIN spaces s ON s.space_id = d.space_id
        JOIN projects p ON p.project_id = s.project_id
        JOIN organizations o ON o.organization_id = p.organization_id
        WHERE o.organization_uuid = ?
          AND v.user_uuid = ANY(?::uuid[])
          AND v.timestamp >= ?
    `,
    bindings: [
        organizationUuid,
        userUuids,
        INTERACTIVE_QUERY_CONTEXTS,
        since,
        organizationUuid,
        userUuids,
        since,
        organizationUuid,
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

    // One scan of the union answers both the weekly buckets and the 30-day active set
    async getActivity(
        organizationUuid: string,
        userUuids: string[],
        windows: ActivityWindows,
    ): Promise<ActivitySnapshot> {
        if (userUuids.length === 0) {
            return { activeUserUuids: [], weeklyActivity: [] };
        }
        const union = activityUnion(
            organizationUuid,
            userUuids,
            windows.trendSince,
        );
        const result = await this.database.raw<{
            rows: {
                user_uuid: string;
                week_start: string;
                is_active_30d: boolean;
            }[];
        }>(
            `SELECT a.user_uuid,
                    to_char(date_trunc('week', a.at), 'YYYY-MM-DD') AS week_start,
                    bool_or(a.at >= ?) AS is_active_30d
             FROM (${union.sql}) a
             GROUP BY a.user_uuid, date_trunc('week', a.at)`,
            [windows.activeSince, ...union.bindings],
        );
        return {
            activeUserUuids: Array.from(
                new Set(
                    result.rows
                        .filter((r) => r.is_active_30d)
                        .map((r) => r.user_uuid),
                ),
            ),
            weeklyActivity: result.rows.map((r) => ({
                userUuid: r.user_uuid,
                weekStart: r.week_start,
            })),
        };
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

    // Same sources, organization scope and 30-day bound as getActivity, so the flag matches the count
    async getMemberActivity(
        organizationUuid: string,
        userUuids: string[],
        since: Date,
    ): Promise<MemberActivityRow[]> {
        if (userUuids.length === 0) return [];
        const result = await this.database.raw<{
            rows: {
                user_uuid: string;
                last_active_at: Date | null;
                is_active_30d: boolean;
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
                  AND context = ANY(?::text[])
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
                   COALESCE(GREATEST(q.last_at, dv.last_at, cv.last_at) >= ?, false) AS is_active_30d,
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
                INTERACTIVE_QUERY_CONTEXTS,
                since,
                organizationUuid,
                userUuids,
                organizationUuid,
                userUuids,
                since,
                userUuids,
            ],
        );
        return result.rows.map((r) => ({
            userUuid: r.user_uuid,
            lastActiveAt: r.last_active_at,
            isActive30d: r.is_active_30d,
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
              AND qh.context = ANY(?::text[])
              AND qh.created_at >= ?
              AND qh.metric_query->>'exploreName' IS NOT NULL
            GROUP BY qh.project_uuid, qh.metric_query->>'exploreName'
            ORDER BY count DESC, name ASC
            LIMIT ?
            `,
            [
                organizationUuid,
                userUuids,
                INTERACTIVE_QUERY_CONTEXTS,
                since,
                limit,
            ],
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
        since: Date,
        limit: number,
    ): Promise<DepartmentTopContent> {
        if (userUuids.length === 0) {
            return { dashboards: [], explores: [], aiAgents: [] };
        }
        const [dashboards, explores, aiAgents] = await Promise.all([
            this.topDashboards(organizationUuid, userUuids, since, limit),
            this.topExplores(organizationUuid, userUuids, since, limit),
            this.topAiAgents(organizationUuid, userUuids, since, limit),
        ]);
        return { dashboards, explores, aiAgents };
    }
}
