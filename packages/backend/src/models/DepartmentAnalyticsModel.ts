import {
    QueryExecutionContext,
    TimeoutError,
    type DepartmentTopContent,
    type DepartmentTopContentItem,
} from '@lightdash/common';
import { Knex } from 'knex';
import { isStatementTimeout } from '../database/errors';
import { queryWorkloadOrigin } from '../services/AsyncQueryService/queryUsage';

export type ActivityRow = { userUuid: string; weekStart: string };

// One clock per request, so every read in it shares the same rolling bounds
export type ActivityWindows = {
    activeSince: Date;
    trendSince: Date;
    // How far back a member's last activity is read
    lastActiveSince: Date;
};

export type ActivitySnapshot = {
    activeUserUuids: string[]; // active since activeSince
    weeklyActivity: ActivityRow[]; // chart and dashboard views only, per person per UTC week
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
    project_uuid: string;
    count: number;
    distinct_people: number;
};

const AI_TABLES = ['ai_prompt', 'ai_thread', 'ai_agent'];

// A runaway read is cancelled instead of holding a pooled connection
const READ_TIMEOUT_MS = 15000;

// Interactive contexts plus AI agent and MCP, since a person asking the agent or using MCP is adoption
const COUNTED_CONTEXT_ORIGINS = ['interactive', 'agent', 'mcp'];

// Only queries a person ran or asked for count as activity; schedules, alerts, syncs, API, CLI and embeds do not
export const COUNTED_QUERY_CONTEXTS: QueryExecutionContext[] = Object.values(
    QueryExecutionContext,
).filter((context) =>
    COUNTED_CONTEXT_ORIGINS.includes(queryWorkloadOrigin(context)),
);

const toTopContentItem = (row: TopContentRow): DepartmentTopContentItem => ({
    id: row.id,
    name: row.name,
    projectUuid: row.project_uuid,
    count: row.count,
    distinctPeople: row.distinct_people,
});

type Deps = { database: Knex };

// The view tables have no organization column, so they are tied to it through the content viewed.
// Queries are only kept for the instance's retention period, so they are read for the 30-day set alone.
// The view tables are read by the organization's member set on their (user_uuid, timestamp)
// index: the set comes from organization_memberships, so it is the tenancy boundary, and a
// person's activity is theirs whatever content it was on. Joining views through chart, space
// and project to the organization made the planner run one scan per chart and sort every
// view to disk (measured at 5 s against 0.8 s on 2.5M views over 12 weeks).
const activityUnion = (
    organizationUuid: string,
    userUuids: string[],
    windows: ActivityWindows,
): { sql: string; bindings: Knex.RawBinding[] } => ({
    sql: `
        SELECT qh.created_by_user_uuid AS user_uuid, qh.created_at AS at, false AS is_view
        FROM query_history qh
        WHERE qh.organization_uuid = ?
          AND qh.created_by_user_uuid = ANY(?::uuid[])
          AND qh.context = ANY(?::text[])
          AND qh.created_at >= ?
        UNION ALL
        SELECT v.user_uuid, v.timestamp AS at, true AS is_view
        FROM analytics_chart_views v
        WHERE v.user_uuid = ANY(?::uuid[])
          AND v.timestamp >= ?
        UNION ALL
        SELECT v.user_uuid, v.timestamp AS at, true AS is_view
        FROM analytics_dashboard_views v
        WHERE v.user_uuid = ANY(?::uuid[])
          AND v.timestamp >= ?
    `,
    bindings: [
        organizationUuid,
        userUuids,
        COUNTED_QUERY_CONTEXTS,
        windows.activeSince,
        userUuids,
        windows.trendSince,
        userUuids,
        windows.trendSince,
    ],
});

export class DepartmentAnalyticsModel {
    protected readonly database: Knex;

    private aiTablesExist: boolean | undefined;

    constructor({ database }: Deps) {
        this.database = database;
    }

    // Each read runs in its own transaction, so SET LOCAL applies to that read alone
    private async bounded<T>(
        read: (trx: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        try {
            return await this.database.transaction(async (trx) => {
                await trx.raw(
                    `SET LOCAL statement_timeout = ${READ_TIMEOUT_MS}`,
                );
                return read(trx);
            });
        } catch (e) {
            if (isStatementTimeout(e)) {
                throw new TimeoutError(
                    'Adoption figures took too long to load. Try again in a minute',
                );
            }
            throw e;
        }
    }

    // One scan answers both: weekly buckets from views only, the 30-day set from views and queries
    async getActivity(
        organizationUuid: string,
        userUuids: string[],
        windows: ActivityWindows,
    ): Promise<ActivitySnapshot> {
        if (userUuids.length === 0) {
            return { activeUserUuids: [], weeklyActivity: [] };
        }
        const union = activityUnion(organizationUuid, userUuids, windows);
        const result = await this.bounded(async (trx) =>
            trx.raw<{
                rows: {
                    user_uuid: string;
                    week_start: string | null; // null on rows that come from queries
                    is_active_30d: boolean;
                }[];
            }>(
                `SELECT a.user_uuid,
                    CASE WHEN a.is_view
                         THEN to_char(date_trunc('week', a.at), 'YYYY-MM-DD')
                    END AS week_start,
                    bool_or(a.at >= ?) AS is_active_30d
             FROM (${union.sql}) a
             GROUP BY a.user_uuid, a.is_view, date_trunc('week', a.at)`,
                [windows.activeSince, ...union.bindings],
            ),
        );
        return {
            activeUserUuids: Array.from(
                new Set(
                    result.rows
                        .filter((r) => r.is_active_30d)
                        .map((r) => r.user_uuid),
                ),
            ),
            weeklyActivity: result.rows.flatMap((r) =>
                r.week_start === null
                    ? []
                    : [{ userUuid: r.user_uuid, weekStart: r.week_start }],
            ),
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

    // Same sources, organization scope and 30-day bound as getActivity, so the flag matches the count.
    // Every source is read back to lastActiveSince only, so lastActiveAt is null beyond it
    async getMemberActivity(
        organizationUuid: string,
        userUuids: string[],
        since: Date,
        lastActiveSince: Date,
    ): Promise<MemberActivityRow[]> {
        if (userUuids.length === 0) return [];
        const result = await this.bounded(async (trx) =>
            trx.raw<{
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
                  AND created_at >= ?
                GROUP BY created_by_user_uuid
            ),
            dv AS (
                SELECT v.user_uuid,
                       MAX(v.timestamp) AS last_at,
                       COUNT(*) FILTER (WHERE v.timestamp >= ?) AS recent
                FROM analytics_dashboard_views v
                WHERE v.user_uuid = ANY(?::uuid[])
                  AND v.timestamp >= ?
                GROUP BY v.user_uuid
            ),
            cv AS (
                SELECT v.user_uuid, MAX(v.timestamp) AS last_at
                FROM analytics_chart_views v
                WHERE v.user_uuid = ANY(?::uuid[])
                  AND v.timestamp >= ?
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
                    COUNTED_QUERY_CONTEXTS,
                    lastActiveSince,
                    since,
                    userUuids,
                    lastActiveSince,
                    userUuids,
                    lastActiveSince,
                    since,
                    userUuids,
                ],
            ),
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
        const result = await this.bounded(async (trx) =>
            trx.raw<{ rows: TopContentRow[] }>(
                `
            SELECT d.dashboard_uuid AS id,
                   d.name,
                   p.project_uuid,
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
            GROUP BY d.dashboard_uuid, d.name, p.project_uuid
            ORDER BY count DESC, d.name ASC
            LIMIT ?
            `,
                [organizationUuid, userUuids, since, limit],
            ),
        );
        return result.rows.map(toTopContentItem);
    }

    private async topExplores(
        organizationUuid: string,
        userUuids: string[],
        since: Date,
        limit: number,
    ): Promise<DepartmentTopContentItem[]> {
        const result = await this.bounded(async (trx) =>
            trx.raw<{ rows: TopContentRow[] }>(
                `
            SELECT concat(qh.project_uuid, ':', qh.metric_query->>'exploreName') AS id,
                   qh.metric_query->>'exploreName' AS name,
                   qh.project_uuid,
                   COUNT(*)::int AS count,
                   COUNT(DISTINCT qh.created_by_user_uuid)::int AS distinct_people
            FROM query_history qh
            WHERE qh.organization_uuid = ?
              AND qh.created_by_user_uuid = ANY(?::uuid[])
              AND qh.context = ANY(?::text[])
              AND qh.created_at >= ?
              AND qh.project_uuid IS NOT NULL
              AND qh.metric_query->>'exploreName' IS NOT NULL
            GROUP BY qh.project_uuid, qh.metric_query->>'exploreName'
            ORDER BY count DESC, name ASC
            LIMIT ?
            `,
                [
                    organizationUuid,
                    userUuids,
                    COUNTED_QUERY_CONTEXTS,
                    since,
                    limit,
                ],
            ),
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
        const result = await this.bounded(async (trx) =>
            trx.raw<{ rows: TopContentRow[] }>(
                `
            SELECT a.ai_agent_uuid AS id,
                   a.name,
                   a.project_uuid,
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
            GROUP BY a.ai_agent_uuid, a.name, a.project_uuid
            ORDER BY count DESC, a.name ASC
            LIMIT ?
            `,
                [organizationUuid, organizationUuid, userUuids, since, limit],
            ),
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
