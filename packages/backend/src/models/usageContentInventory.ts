import type { Knex } from 'knex';

// Page each source on its native indexed UUID before computing any metadata.
// A combined, computed inventory key requires sorting/enriching the entire inventory.
const sources = {
    saved_chart: {
        idColumn: 'c.saved_query_uuid',
        scheduleColumn: 'saved_chart_uuid',
        sql: `SELECT 'saved_chart' AS content_type, c.saved_query_uuid AS content_id,
            c.name AS content_name, c.project_uuid AS project_id,
            COALESCE(c.space_id, d.space_id) AS space_id,
            c.created_at, c.deleted_at, d.deleted_at AS parent_deleted_at,
            NULL::uuid AS owner_id, false AS supports_owner,
            c.saved_query_id AS chart_number
        FROM saved_queries c JOIN projects p ON p.project_uuid = c.project_uuid
        LEFT JOIN dashboards d ON d.dashboard_uuid = c.dashboard_uuid
        WHERE p.organization_id = ?`,
    },
    sql_chart: {
        idColumn: 'c.saved_sql_uuid',
        scheduleColumn: 'saved_sql_uuid',
        sql: `SELECT 'sql_chart', c.saved_sql_uuid, c.name, c.project_uuid,
            COALESCE(s.space_id, d.space_id), c.created_at, c.deleted_at,
            d.deleted_at, NULL::uuid, false, NULL::integer
        FROM saved_sql c JOIN projects p ON p.project_uuid = c.project_uuid
        LEFT JOIN spaces s ON s.space_uuid = c.space_uuid
        LEFT JOIN dashboards d ON d.dashboard_uuid = c.dashboard_uuid
        WHERE p.organization_id = ?`,
    },
    dashboard: {
        idColumn: 'd.dashboard_uuid',
        scheduleColumn: 'dashboard_uuid',
        sql: `SELECT 'dashboard', d.dashboard_uuid, d.name, p.project_uuid,
            d.space_id, d.created_at, d.deleted_at, NULL::timestamptz,
            d.owner_user_uuid, true, NULL::integer
        FROM dashboards d JOIN spaces s ON s.space_id = d.space_id
        JOIN projects p ON p.project_id = s.project_id
        WHERE p.organization_id = ?`,
    },
    data_app: {
        idColumn: 'a.app_id',
        scheduleColumn: 'app_uuid',
        sql: `SELECT 'data_app', a.app_id, a.name, a.project_uuid,
            s.space_id, a.created_at, a.deleted_at, NULL::timestamptz,
            NULL::uuid, false, NULL::integer
        FROM apps a JOIN projects p ON p.project_uuid = a.project_uuid
        LEFT JOIN spaces s ON s.space_uuid = a.space_uuid
        WHERE p.organization_id = ?`,
    },
} as const;

export type UsageContentType = keyof typeof sources;
export const usageContentTypes = Object.keys(sources) as UsageContentType[];

const references = {
    saved_chart: {
        table: 'dashboard_tile_charts',
        column: 'saved_chart_id',
        inventoryColumn: 'chart_number',
    },
    sql_chart: {
        table: 'dashboard_tile_sql_charts',
        column: 'saved_sql_uuid',
        inventoryColumn: 'content_id',
    },
    data_app: {
        table: 'dashboard_tile_data_apps',
        column: 'app_uuid',
        inventoryColumn: 'content_id',
    },
} as const;

/** One row per current/soft-deleted item, including items without events.
 * Enrich only a materialized page; aggregate dependencies once per page so repeated
 * tiles cannot multiply inventory rows. SQL-chart creators/editors are not owners.
 */
export const usageContentInventoryQuery = (
    database: Knex,
    organizationId: number,
    organizationUuid: string,
    contentType: UsageContentType,
    cursor: string | null,
    pageSize: number,
): Knex.QueryBuilder => {
    const source = sources[contentType];
    const reference =
        contentType === 'dashboard' ? null : references[contentType];
    const inventory = database.raw(
        `WITH inventory (content_type, content_id, content_name, project_id, space_id,
            created_at, deleted_at, parent_deleted_at, owner_id, supports_owner, chart_number) AS MATERIALIZED (
            ${source.sql}
            ${cursor === null ? '' : `AND ${source.idColumn} > ?::uuid`}
            ORDER BY ${source.idColumn} LIMIT ?
        ), schedules AS (
            SELECT i.content_id, COUNT(*) AS count
            FROM inventory i JOIN scheduler sc ON sc.${source.scheduleColumn} = i.content_id
            WHERE sc.enabled AND sc.deleted_at IS NULL
                AND (sc.project_uuid = i.project_id OR sc.project_uuid IS NULL)
            GROUP BY i.content_id
        ), referenced_dashboards AS MATERIALIZED (
            ${
                reference
                    ? `
            SELECT i.content_id, d.dashboard_id, d.dashboard_version_id
            FROM inventory i
            JOIN ${reference.table} t ON t.${reference.column} = i.${reference.inventoryColumn}
            -- This key identifies at most one row. Keep the lookup lateral so
            -- a page cannot hash/scan the whole instance's version history.
            JOIN LATERAL (
                SELECT d.dashboard_id, v.dashboard_version_id
                FROM dashboard_versions v
                JOIN dashboards d ON d.dashboard_id = v.dashboard_id
                JOIN spaces s ON s.space_id = d.space_id
                JOIN projects p ON p.project_id = s.project_id
                WHERE v.dashboard_version_id = t.dashboard_version_id
                    AND p.project_uuid = i.project_id
                    AND d.deleted_at IS NULL AND s.deleted_at IS NULL
                LIMIT 1
            ) d ON true
            `
                    : 'SELECT NULL::uuid AS content_id, NULL::integer AS dashboard_id, NULL::integer AS dashboard_version_id WHERE false'
            }
        ), latest_referenced_dashboards AS MATERIALIZED (
            -- Resolve the latest version once per distinct dashboard in this page,
            -- not once per historical tile. Materialize before joining tiles back
            -- so the planner cannot inline and repeat this lookup for each tile.
            SELECT d.dashboard_id, (SELECT MAX(latest.dashboard_version_id)
                FROM dashboard_versions latest WHERE latest.dashboard_id = d.dashboard_id) AS dashboard_version_id
            FROM (SELECT DISTINCT dashboard_id FROM referenced_dashboards) d
        ), dashboard_references AS (
            SELECT content_id, COUNT(DISTINCT dashboard_id) AS count
            FROM referenced_dashboards d
            JOIN latest_referenced_dashboards latest USING (dashboard_id, dashboard_version_id)
            GROUP BY content_id
        )
    SELECT i.content_id AS cursor,
        json_build_object(
            'org_id', ?::text, 'project_id', i.project_id, 'project_name', p.name,
            'content_type', i.content_type, 'content_id', i.content_id,
            'content_name', i.content_name, 'space_id', s.space_uuid, 'space_name', s.name,
            'created_at', i.created_at, 'deleted_at', COALESCE(i.deleted_at, i.parent_deleted_at, s.deleted_at),
            'is_deleted', i.deleted_at IS NOT NULL OR i.parent_deleted_at IS NOT NULL OR s.deleted_at IS NOT NULL,
            'snapshot_at', CURRENT_TIMESTAMP,
            'owner_id', i.owner_id, 'owner_name', NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
            'owner_status', CASE WHEN NOT i.supports_owner THEN 'Not recorded'
                WHEN i.owner_id IS NULL THEN 'Unassigned'
                WHEN u.user_id IS NULL THEN 'Unknown user'
                WHEN NOT u.is_active THEN 'Deactivated'
                WHEN NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = p.organization_id AND m.user_id = u.user_id) THEN 'Not an organization member'
                ELSE 'Active organization member' END,
            'is_verified', CASE WHEN i.content_type IN ('saved_chart', 'dashboard') THEN EXISTS (
                SELECT 1 FROM content_verification v WHERE v.content_uuid = i.content_id
                AND v.project_uuid = i.project_id
                AND v.content_type = CASE WHEN i.content_type = 'saved_chart' THEN 'chart' ELSE 'dashboard' END
            ) ELSE NULL END,
            'enabled_schedules', COALESCE(sc.count, 0),
            'dashboard_references', COALESCE(dr.count, 0)
        )::text AS json
    FROM inventory i JOIN projects p ON p.project_uuid = i.project_id
    LEFT JOIN spaces s ON s.space_id = i.space_id AND s.project_id = p.project_id
    LEFT JOIN users u ON u.user_uuid = i.owner_id
    LEFT JOIN schedules sc ON sc.content_id = i.content_id
    LEFT JOIN dashboard_references dr ON dr.content_id = i.content_id
    `,
        [
            organizationId,
            ...(cursor === null ? [] : [cursor]),
            pageSize,
            organizationUuid,
        ],
    );
    return database
        .from(inventory.wrap('(', ') AS inventory'))
        .select('inventory.cursor', 'inventory.json')
        .orderBy('inventory.cursor');
};
