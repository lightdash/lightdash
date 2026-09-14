import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Fills missing scheduler ownership and slugs without changing complete rows',
};

const SchedulerTableName = 'scheduler';
const BatchSize = 1000;

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

async function reconcileBatch(knex: Knex): Promise<void> {
    const result = await knex.raw<{ rowCount: number }>(`
        WITH resource_projects AS (
            SELECT scheduler.scheduler_uuid, scheduler.project_uuid
            FROM ${SchedulerTableName} AS scheduler
            WHERE scheduler.project_uuid IS NOT NULL
              AND scheduler.slug IS NULL

            UNION ALL

            SELECT scheduler.scheduler_uuid, projects.project_uuid
            FROM ${SchedulerTableName} AS scheduler
            JOIN saved_queries
                ON saved_queries.saved_query_uuid = scheduler.saved_chart_uuid
            LEFT JOIN dashboards
                ON dashboards.dashboard_uuid = saved_queries.dashboard_uuid
            JOIN spaces
                ON spaces.space_id = COALESCE(
                    saved_queries.space_id,
                    dashboards.space_id
                )
            JOIN projects ON projects.project_id = spaces.project_id
            WHERE scheduler.project_uuid IS NULL

            UNION ALL

            SELECT scheduler.scheduler_uuid, projects.project_uuid
            FROM ${SchedulerTableName} AS scheduler
            JOIN dashboards
                ON dashboards.dashboard_uuid = scheduler.dashboard_uuid
            JOIN spaces ON spaces.space_id = dashboards.space_id
            JOIN projects ON projects.project_id = spaces.project_id
            WHERE scheduler.project_uuid IS NULL

            UNION ALL

            SELECT scheduler.scheduler_uuid, saved_sql.project_uuid
            FROM ${SchedulerTableName} AS scheduler
            JOIN saved_sql
                ON saved_sql.saved_sql_uuid = scheduler.saved_sql_uuid
            WHERE scheduler.project_uuid IS NULL

            UNION ALL

            SELECT scheduler.scheduler_uuid, apps.project_uuid
            FROM ${SchedulerTableName} AS scheduler
            JOIN apps ON apps.app_id = scheduler.app_uuid
            WHERE scheduler.project_uuid IS NULL
        ), resolved AS (
            SELECT
                scheduler.scheduler_uuid,
                resource_projects.project_uuid,
                scheduler.created_at,
                COALESCE(
                    scheduler.slug,
                    NULLIF(
                        LEFT(
                            TRIM(
                                BOTH '-' FROM REGEXP_REPLACE(
                                    LOWER(scheduler.name),
                                    '[^a-z0-9]+',
                                    '-',
                                    'g'
                                )
                            ),
                            240
                        ),
                        ''
                    ),
                    LEFT(scheduler.scheduler_uuid::text, 8)
                ) AS base_slug
            FROM resource_projects
            JOIN ${SchedulerTableName} AS scheduler
                ON scheduler.scheduler_uuid = resource_projects.scheduler_uuid
            WHERE resource_projects.project_uuid IS NOT NULL
              AND (
                  scheduler.project_uuid IS NULL
                  OR scheduler.slug IS NULL
              )
        ), batch AS (
            SELECT *
            FROM resolved
            ORDER BY created_at, scheduler_uuid
            LIMIT ${BatchSize}
        ), ranked AS (
            SELECT
                batch.*,
                ROW_NUMBER() OVER (
                    PARTITION BY project_uuid, base_slug
                    ORDER BY created_at, scheduler_uuid
                ) AS duplicate_number
            FROM batch
        ), replacements AS (
            SELECT
                ranked.scheduler_uuid,
                ranked.project_uuid,
                replacement.candidate AS slug
            FROM ranked
            CROSS JOIN LATERAL (
                WITH RECURSIVE candidates(attempt, candidate) AS (
                    SELECT
                        CASE WHEN ranked.duplicate_number = 1 THEN 0 ELSE 1 END,
                        (CASE
                            WHEN ranked.duplicate_number = 1
                                THEN ranked.base_slug
                            ELSE LEFT(ranked.base_slug, 218) || '-' ||
                                ranked.scheduler_uuid::text
                        END)::text
                    UNION ALL
                    SELECT
                        candidates.attempt + 1,
                        CASE
                            WHEN candidates.attempt = 0
                                THEN LEFT(ranked.base_slug, 218) || '-' ||
                                    ranked.scheduler_uuid::text
                            ELSE LEFT(ranked.base_slug, 200) || '-' ||
                                ranked.scheduler_uuid::text || '-' ||
                                (candidates.attempt + 1)::text
                        END
                    FROM candidates
                    WHERE EXISTS (
                        SELECT 1
                        FROM ${SchedulerTableName} AS existing
                        WHERE existing.project_uuid = ranked.project_uuid
                          AND existing.slug = candidates.candidate
                          AND existing.scheduler_uuid <>
                              ranked.scheduler_uuid
                    )
                )
                SELECT candidates.candidate
                FROM candidates
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM ${SchedulerTableName} AS existing
                    WHERE existing.project_uuid = ranked.project_uuid
                      AND existing.slug = candidates.candidate
                      AND existing.scheduler_uuid <> ranked.scheduler_uuid
                )
                ORDER BY candidates.attempt
                LIMIT 1
            ) AS replacement
        )
        UPDATE ${SchedulerTableName} AS scheduler
        SET
            project_uuid = replacements.project_uuid,
            slug = replacements.slug
        FROM replacements
        WHERE scheduler.scheduler_uuid = replacements.scheduler_uuid
          AND (
              scheduler.project_uuid IS NULL
              OR scheduler.slug IS NULL
          )
    `);
    const updated = getRowCount(result);
    if (updated === 0) return;

    await reconcileBatch(knex);
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await reconcileBatch(knex);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(): Promise<void> {
    throw new Error('irreversible: scheduler repair has no safe rollback');
}
