import { Knex } from 'knex';

const LockTimeout = '5s';

/**
 * Saved SQL charts become saved charts whose version carries a one-node
 * pipeline (the statement), so every consumer of saved charts serves them.
 *
 * Every `saved_sql` row is copied into `saved_queries` under the same uuid,
 * with one version per chart: the latest `saved_sql_versions` row becomes a
 * `saved_queries_versions` placeholder and a `saved_queries_version_pipelines`
 * row at schema version 0 that holds the statement, limit, connection and the
 * SQL runner config as they were. The backend converts schema version 0 to a
 * pipeline and an explorer chart config when it reads the chart, and the next
 * save writes the converted shape at schema version 1.
 *
 * The `saved_sql*` tables are left as they are: the previous release reads and
 * writes them during a rolling update. A later migration drops them.
 *
 * Direct grants are copied to the saved chart grant tables. Dashboard tiles,
 * schedulers, documents and artifacts keep their `saved_sql_uuid` columns; the
 * backend reads those uuids as saved chart uuids.
 *
 * Idempotent: every statement skips rows that already have a copy.
 */
export const classification = {
    kind: 'safe',
    reason: 'Inserts copies of saved SQL charts; nothing existing is altered or removed',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);

    // A SQL chart's slug yields to a saved chart that already holds it in the
    // project; the suffix keeps the copy addressable
    await knex.raw(`
        INSERT INTO saved_queries (
            saved_query_uuid, project_uuid, space_id, dashboard_uuid, name,
            description, created_at, last_version_chart_kind,
            last_version_updated_at, last_version_updated_by_user_uuid, slug,
            views_count, first_viewed_at, deleted_at, deleted_by_user_uuid
        )
        SELECT
            s.saved_sql_uuid, s.project_uuid, sp.space_id, s.dashboard_uuid,
            s.name, s.description, s.created_at, s.last_version_chart_kind,
            s.last_version_updated_at, s.last_version_updated_by_user_uuid,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM saved_queries q
                    WHERE q.project_uuid = s.project_uuid AND q.slug = s.slug
                )
                THEN s.slug || '-sql-' || left(s.saved_sql_uuid::text, 8)
                ELSE s.slug
            END,
            s.views_count, s.first_viewed_at, s.deleted_at, s.deleted_by_user_uuid
        FROM saved_sql s
        LEFT JOIN spaces sp ON sp.space_uuid = s.space_uuid
        WHERE NOT EXISTS (
            SELECT 1 FROM saved_queries q WHERE q.saved_query_uuid = s.saved_sql_uuid
        )
    `);

    // One version per chart: the latest statement. The placeholder explore
    // name, chart type and config are overridden by the schema version 0
    // pipeline row when the chart is read
    await knex.raw(`
        INSERT INTO saved_queries_versions (
            created_at, explore_name, filters, row_limit, chart_type,
            saved_query_id, chart_config, updated_by_user_uuid, agent_identity
        )
        SELECT
            v.created_at, 'sql', '{}'::jsonb, COALESCE(v."limit", 500), 'table',
            q.saved_query_id, '{}'::jsonb, v.created_by_user_uuid, v.agent_identity
        FROM saved_sql s
        JOIN saved_queries q ON q.saved_query_uuid = s.saved_sql_uuid
        JOIN LATERAL (
            SELECT * FROM saved_sql_versions sv
            WHERE sv.saved_sql_uuid = s.saved_sql_uuid
            ORDER BY sv.created_at DESC, sv.saved_sql_version_uuid DESC
            LIMIT 1
        ) v ON true
        WHERE NOT EXISTS (
            SELECT 1 FROM saved_queries_versions qv WHERE qv.saved_query_id = q.saved_query_id
        )
    `);

    await knex.raw(`
        INSERT INTO saved_queries_version_pipelines (
            saved_queries_version_id, schema_version, pipeline
        )
        SELECT
            qv.saved_queries_version_id, 0,
            jsonb_build_object(
                'sql', v.sql,
                'limit', COALESCE(v."limit", 500),
                'config', v.config,
                'warehouseConnectionUuid', v.warehouse_connection_uuid
            )
        FROM saved_sql s
        JOIN saved_queries q ON q.saved_query_uuid = s.saved_sql_uuid
        JOIN saved_queries_versions qv ON qv.saved_query_id = q.saved_query_id
        JOIN LATERAL (
            SELECT * FROM saved_sql_versions sv
            WHERE sv.saved_sql_uuid = s.saved_sql_uuid
            ORDER BY sv.created_at DESC, sv.saved_sql_version_uuid DESC
            LIMIT 1
        ) v ON true
        WHERE NOT EXISTS (
            SELECT 1 FROM saved_queries_version_pipelines p
            WHERE p.saved_queries_version_id = qv.saved_queries_version_id
        )
    `);

    await knex.raw(`
        INSERT INTO saved_chart_user_access (
            saved_chart_uuid, user_uuid, space_role, granted_by_user_uuid, created_at, updated_at
        )
        SELECT saved_sql_uuid, user_uuid, space_role, granted_by_user_uuid, created_at, updated_at
        FROM saved_sql_user_access
        ON CONFLICT DO NOTHING
    `);
    await knex.raw(`
        INSERT INTO saved_chart_group_access (
            saved_chart_uuid, group_uuid, space_role, granted_by_user_uuid, created_at, updated_at
        )
        SELECT saved_sql_uuid, group_uuid, space_role, granted_by_user_uuid, created_at, updated_at
        FROM saved_sql_group_access
        ON CONFLICT DO NOTHING
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
    // The copies cascade to their versions, pipelines and grants
    await knex.raw(`
        DELETE FROM saved_queries q
        USING saved_sql s
        WHERE q.saved_query_uuid = s.saved_sql_uuid
    `);
    await knex.raw(`
        DELETE FROM saved_chart_user_access a
        USING saved_sql_user_access s
        WHERE a.saved_chart_uuid = s.saved_sql_uuid AND a.user_uuid = s.user_uuid
    `);
    await knex.raw(`
        DELETE FROM saved_chart_group_access a
        USING saved_sql_group_access s
        WHERE a.saved_chart_uuid = s.saved_sql_uuid AND a.group_uuid = s.group_uuid
    `);
}
