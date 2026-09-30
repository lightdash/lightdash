import type { Knex } from 'knex';

/** One row per current/soft-deleted item, including items without any events.
 * Counts use scalar subqueries so dependencies never multiply inventory rows.
 * SQL-chart creators and last editors are not inferred to be owners.
 */
export const usageContentInventoryQuery = (
    database: Knex,
    organizationId: number,
    organizationUuid: string,
): Knex.QueryBuilder => {
    const inventory = database.raw(
        `WITH inventory AS (
        SELECT 'saved_chart' AS content_type, c.saved_query_uuid AS content_id,
            c.name AS content_name, c.project_uuid AS project_id,
            COALESCE(c.space_id, d.space_id) AS space_id,
            c.created_at, c.deleted_at, d.deleted_at AS parent_deleted_at,
            NULL::uuid AS owner_id, false AS supports_owner,
            c.saved_query_id AS chart_number
        FROM saved_queries c JOIN projects p ON p.project_uuid = c.project_uuid
        LEFT JOIN dashboards d ON d.dashboard_uuid = c.dashboard_uuid
        WHERE p.organization_id = ?
        UNION ALL
        SELECT 'sql_chart', c.saved_sql_uuid, c.name, c.project_uuid,
            COALESCE(s.space_id, d.space_id), c.created_at, c.deleted_at,
            d.deleted_at, NULL::uuid, false, NULL::integer
        FROM saved_sql c JOIN projects p ON p.project_uuid = c.project_uuid
        LEFT JOIN spaces s ON s.space_uuid = c.space_uuid
        LEFT JOIN dashboards d ON d.dashboard_uuid = c.dashboard_uuid
        WHERE p.organization_id = ?
        UNION ALL
        SELECT 'dashboard', d.dashboard_uuid, d.name, p.project_uuid,
            d.space_id, d.created_at, d.deleted_at, NULL::timestamptz,
            d.owner_user_uuid, true, NULL::integer
        FROM dashboards d JOIN spaces s ON s.space_id = d.space_id
        JOIN projects p ON p.project_id = s.project_id
        WHERE p.organization_id = ?
        UNION ALL
        SELECT 'data_app', a.app_id, a.name, a.project_uuid,
            s.space_id, a.created_at, a.deleted_at, NULL::timestamptz,
            NULL::uuid, false, NULL::integer
        FROM apps a JOIN projects p ON p.project_uuid = a.project_uuid
        LEFT JOIN spaces s ON s.space_uuid = a.space_uuid
        WHERE p.organization_id = ?
    ), latest_dashboards AS (
        SELECT d.dashboard_id, d.dashboard_uuid, p.project_uuid,
            (SELECT MAX(v.dashboard_version_id) FROM dashboard_versions v
             WHERE v.dashboard_id = d.dashboard_id) AS version_id
        FROM dashboards d JOIN spaces s ON s.space_id = d.space_id
        JOIN projects p ON p.project_id = s.project_id
        WHERE p.organization_id = ? AND d.deleted_at IS NULL AND s.deleted_at IS NULL
    )
    SELECT i.content_type || ':' || i.content_id::text AS inventory_id,
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
            'enabled_schedules', (SELECT COUNT(*) FROM scheduler sc WHERE sc.enabled AND sc.deleted_at IS NULL
                AND (sc.project_uuid = i.project_id OR sc.project_uuid IS NULL)
                AND CASE i.content_type
                    WHEN 'saved_chart' THEN sc.saved_chart_uuid = i.content_id
                    WHEN 'sql_chart' THEN sc.saved_sql_uuid = i.content_id
                    WHEN 'dashboard' THEN sc.dashboard_uuid = i.content_id
                    WHEN 'data_app' THEN sc.app_uuid = i.content_id END),
            'dashboard_references', (SELECT COUNT(*) FROM latest_dashboards d WHERE d.project_uuid = i.project_id AND CASE i.content_type
                WHEN 'saved_chart' THEN EXISTS (SELECT 1 FROM dashboard_tile_charts t WHERE t.dashboard_version_id = d.version_id AND t.saved_chart_id = i.chart_number)
                WHEN 'sql_chart' THEN EXISTS (SELECT 1 FROM dashboard_tile_sql_charts t WHERE t.dashboard_version_id = d.version_id AND t.saved_sql_uuid = i.content_id)
                WHEN 'data_app' THEN EXISTS (SELECT 1 FROM dashboard_tile_data_apps t WHERE t.dashboard_version_id = d.version_id AND t.app_uuid = i.content_id)
                ELSE false END)
        )::text AS json
    FROM inventory i JOIN projects p ON p.project_uuid = i.project_id
    LEFT JOIN spaces s ON s.space_id = i.space_id AND s.project_id = p.project_id
    LEFT JOIN users u ON u.user_uuid = i.owner_id`,
        [
            organizationId,
            organizationId,
            organizationId,
            organizationId,
            organizationId,
            organizationUuid,
        ],
    );
    return database
        .from(inventory.wrap('(', ') AS inventory'))
        .select('inventory.json');
};
