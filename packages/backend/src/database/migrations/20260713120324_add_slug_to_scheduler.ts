import { Knex } from 'knex';

export const config = { transaction: false };

const SchedulerTableName = 'scheduler';
const SchedulerProjectForeignKey = 'scheduler_project_uuid_foreign';
const SchedulerProjectSlugIndex = 'scheduler_project_uuid_slug_unique';
const BatchSize = 1000;

const logProgress = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`  ${SchedulerTableName}: ${message}`);
};

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

async function addColumnsAndForeignKey(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${SchedulerTableName}
        ADD COLUMN IF NOT EXISTS project_uuid uuid,
        ADD COLUMN IF NOT EXISTS slug varchar(255)
    `);

    const foreignKey = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass`,
        [SchedulerProjectForeignKey, SchedulerTableName],
    );
    if (getRowCount(foreignKey) === 0) {
        await knex.raw(`
            ALTER TABLE ${SchedulerTableName}
            ADD CONSTRAINT ${SchedulerProjectForeignKey}
            FOREIGN KEY (project_uuid)
            REFERENCES projects(project_uuid)
            ON DELETE CASCADE
            NOT VALID
        `);
    }
}

async function backfillProjectUuids(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex.raw<{ rowCount: number }>(`
            WITH resource_projects AS (
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
            ), batch AS (
                SELECT scheduler_uuid, project_uuid
                FROM resource_projects
                LIMIT ${BatchSize}
            )
            UPDATE ${SchedulerTableName} AS scheduler
            SET project_uuid = batch.project_uuid
            FROM batch
            WHERE scheduler.scheduler_uuid = batch.scheduler_uuid
        `);
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`backfilled project UUID for ${totalUpdated} rows`);
    }
}

async function backfillSlugs(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex.raw<{ rowCount: number }>(`
            WITH batch AS (
                SELECT ctid
                FROM ${SchedulerTableName}
                WHERE project_uuid IS NOT NULL AND slug IS NULL
                LIMIT ${BatchSize}
            )
            UPDATE ${SchedulerTableName} AS scheduler
            SET slug = COALESCE(
                NULLIF(
                    LEFT(
                        TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g')),
                        240
                    ),
                    ''
                ),
                LEFT(scheduler_uuid::text, 8)
            )
            FROM batch
            WHERE scheduler.ctid = batch.ctid
        `);
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`backfilled slug for ${totalUpdated} rows`);
    }

    let totalDeduplicated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex.raw<{ rowCount: number }>(`
            WITH duplicate_rows AS (
                SELECT scheduler_uuid
                FROM (
                    SELECT
                        scheduler_uuid,
                        ROW_NUMBER() OVER (
                            PARTITION BY project_uuid, slug
                            ORDER BY created_at, scheduler_uuid
                        ) AS duplicate_number
                    FROM ${SchedulerTableName}
                    WHERE project_uuid IS NOT NULL AND slug IS NOT NULL
                ) AS ranked
                WHERE duplicate_number > 1
                LIMIT ${BatchSize}
            )
            UPDATE ${SchedulerTableName} AS scheduler
            SET slug = LEFT(scheduler.slug, 218) || '-' || scheduler.scheduler_uuid::text
            FROM duplicate_rows
            WHERE scheduler.scheduler_uuid = duplicate_rows.scheduler_uuid
        `);
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalDeduplicated += updated;
        logProgress(`deduplicated slug for ${totalDeduplicated} rows`);
    }
}

async function createProjectSlugIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ? AND NOT pg_index.indisvalid`,
        [SchedulerProjectSlugIndex],
    );
    if (getRowCount(invalidIndex) > 0) {
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${SchedulerProjectSlugIndex}`,
        );
    }

    logProgress('building project slug unique index concurrently');
    await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${SchedulerProjectSlugIndex}
        ON ${SchedulerTableName} (project_uuid, slug)
        WHERE project_uuid IS NOT NULL AND slug IS NOT NULL
    `);
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await addColumnsAndForeignKey(knex);
        await backfillProjectUuids(knex);
        await backfillSlugs(knex);

        logProgress('validating project foreign key');
        await knex.raw(`
            ALTER TABLE ${SchedulerTableName}
            VALIDATE CONSTRAINT ${SchedulerProjectForeignKey}
        `);

        await createProjectSlugIndex(knex);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS ${SchedulerProjectSlugIndex}`,
    );
    await knex.raw(`
        ALTER TABLE ${SchedulerTableName}
        DROP CONSTRAINT IF EXISTS ${SchedulerProjectForeignKey},
        DROP COLUMN IF EXISTS slug,
        DROP COLUMN IF EXISTS project_uuid
    `);
}
