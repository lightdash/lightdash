import { Knex } from 'knex';

export const config = { transaction: false };

const DashboardsTableName = 'dashboards';
const ProjectForeignKey = 'dashboards_project_uuid_foreign';
const ProjectNotNullCheck = 'dashboards_project_uuid_not_null';
const ProjectSlugUniqueConstraint = 'dashboards_project_uuid_slug_unique';
const BatchSize = 1000;
const MaxGeneratedSlugLength = 255;
const LockTimeout = '5s';

/**
 * Contract phase for direct dashboard ownership and project-scoped slugs.
 *
 * Ownership is always resolvable through existing schema guarantees:
 *
 * dashboards.space_id (NOT NULL FK, CASCADE)
 *   -> spaces.project_id (NOT NULL FK, CASCADE)
 *   -> projects.project_uuid (NOT NULL)
 *
 * The migration runs without Knex's outer transaction so repairs can commit in
 * bounded batches and the unique index can be built concurrently. Every phase
 * is therefore idempotent and safe to resume after the migration lock has been
 * released:
 *
 * 1. Reconcile existing direct owners from the canonical FK chain.
 * 2. Add a NOT VALID non-null check, which immediately protects new writes.
 * 3. Reconcile again to repair rows inserted between steps 1 and 2.
 * 4. Rename only same-project duplicate slugs in committed batches.
 * 5. Build the unique index concurrently and attach it as a constraint.
 * 6. Validate/set NOT NULL and add/validate the project foreign key.
 *
 * Rollback removes the database contract but intentionally does not restore
 * duplicate slug values or previous project UUIDs: those repairs are valid data
 * independently of the constraints.
 */

const logProgress = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`  ${DashboardsTableName}: ${message}`);
};

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

async function constraintExists(
    knex: Knex,
    constraintName: string,
    constraintType?: 'f' | 'u',
): Promise<boolean> {
    const result = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_constraint
         WHERE conname = ?
           AND conrelid = ?::regclass
           ${constraintType ? 'AND contype = ?' : ''}`,
        constraintType
            ? [constraintName, DashboardsTableName, constraintType]
            : [constraintName, DashboardsTableName],
    );
    return getRowCount(result) > 0;
}

async function isProjectUuidNotNull(knex: Knex): Promise<boolean> {
    const result = await knex.raw<{ rows: Array<{ attnotnull: boolean }> }>(
        `SELECT attnotnull
         FROM pg_attribute
         WHERE attrelid = ?::regclass
           AND attname = 'project_uuid'`,
        [DashboardsTableName],
    );
    return result.rows[0]?.attnotnull ?? false;
}

async function withLockTimeout<T>(
    knex: Knex,
    callback: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
    return knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        return callback(trx);
    });
}

async function addProjectNotNullCheck(knex: Knex): Promise<void> {
    if (
        (await isProjectUuidNotNull(knex)) ||
        (await constraintExists(knex, ProjectNotNullCheck))
    ) {
        return;
    }

    logProgress('adding the project UUID not-null check');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            ADD CONSTRAINT ${ProjectNotNullCheck}
            CHECK (project_uuid IS NOT NULL)
            NOT VALID
        `);
    });
}

async function reconcileProjectUuids(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT
                        dashboards.dashboard_id,
                        projects.project_uuid
                    FROM ${DashboardsTableName} AS dashboards
                    INNER JOIN spaces
                        ON spaces.space_id = dashboards.space_id
                    INNER JOIN projects
                        ON projects.project_id = spaces.project_id
                    WHERE dashboards.project_uuid IS DISTINCT FROM projects.project_uuid
                    ORDER BY dashboards.dashboard_id
                    LIMIT ${BatchSize}
                )
                UPDATE ${DashboardsTableName} AS dashboards
                SET project_uuid = batch.project_uuid
                FROM batch
                WHERE dashboards.dashboard_id = batch.dashboard_id
                  AND dashboards.project_uuid IS DISTINCT FROM batch.project_uuid
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`reconciled project UUID for ${totalUpdated} rows`);
    }
}

async function deduplicateSlugs(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH ranked AS (
                    SELECT
                        dashboard_id,
                        project_uuid,
                        slug,
                        ROW_NUMBER() OVER (
                            PARTITION BY project_uuid, slug
                            -- Preserve the public slug on an active dashboard.
                            -- Ties are resolved deterministically for reruns.
                            ORDER BY
                                (deleted_at IS NULL) DESC,
                                created_at,
                                dashboard_id
                        ) AS duplicate_number
                    FROM ${DashboardsTableName}
                ), duplicate_rows AS (
                    SELECT dashboard_id, project_uuid, slug
                    FROM ranked
                    WHERE duplicate_number > 1
                    ORDER BY project_uuid, slug, dashboard_id
                    LIMIT ${BatchSize}
                ), replacements AS (
                    SELECT
                        duplicate_rows.dashboard_id,
                        duplicate_rows.project_uuid,
                        duplicate_rows.slug AS original_slug,
                        replacement.candidate
                    FROM duplicate_rows
                    CROSS JOIN LATERAL (
                        WITH RECURSIVE candidates(attempt, candidate) AS (
                            -- Primary-key suffixes let a whole batch be updated without
                            -- replacement rows colliding with one another. Only
                            -- conflicting rows are capped to an index-safe size;
                            -- unique existing slugs are never rewritten.
                            SELECT
                                0,
                                LEFT(
                                    duplicate_rows.slug,
                                    GREATEST(
                                        0,
                                        ${MaxGeneratedSlugLength - 1} -
                                            CHAR_LENGTH(duplicate_rows.dashboard_id::text)
                                    )
                                ) || '-' ||
                                    duplicate_rows.dashboard_id::text
                            UNION ALL
                            SELECT
                                candidates.attempt + 1,
                                LEFT(
                                    duplicate_rows.slug,
                                    GREATEST(
                                        0,
                                        ${MaxGeneratedSlugLength - 2} -
                                            CHAR_LENGTH(duplicate_rows.dashboard_id::text) -
                                            CHAR_LENGTH((candidates.attempt + 1)::text)
                                    )
                                ) || '-' ||
                                    duplicate_rows.dashboard_id::text || '-' ||
                                    (candidates.attempt + 1)::text
                            FROM candidates
                            WHERE EXISTS (
                                SELECT 1
                                FROM ${DashboardsTableName} AS existing
                                WHERE existing.project_uuid = duplicate_rows.project_uuid
                                  AND existing.slug = candidates.candidate
                                  AND existing.dashboard_id <> duplicate_rows.dashboard_id
                            )
                        )
                        SELECT candidates.candidate
                        FROM candidates
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM ${DashboardsTableName} AS existing
                            WHERE existing.project_uuid = duplicate_rows.project_uuid
                              AND existing.slug = candidates.candidate
                              AND existing.dashboard_id <> duplicate_rows.dashboard_id
                        )
                        ORDER BY candidates.attempt
                        LIMIT 1
                    ) AS replacement
                )
                UPDATE ${DashboardsTableName} AS dashboards
                SET slug = replacements.candidate
                FROM replacements
                WHERE dashboards.dashboard_id = replacements.dashboard_id
                  AND dashboards.project_uuid = replacements.project_uuid
                  AND dashboards.slug = replacements.original_slug
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`deduplicated slug for ${totalUpdated} rows`);
    }
}

async function createProjectSlugConstraint(knex: Knex): Promise<void> {
    if (await constraintExists(knex, ProjectSlugUniqueConstraint, 'u')) {
        return;
    }

    // CREATE INDEX CONCURRENTLY can leave an INVALID index if interrupted.
    // Remove that artifact before retrying the otherwise idempotent build.
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [ProjectSlugUniqueConstraint, DashboardsTableName],
    );
    if (getRowCount(invalidIndex) > 0) {
        logProgress('dropping an invalid project slug index from a prior run');
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
        );
    }

    logProgress('building the project slug unique index concurrently');
    await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${ProjectSlugUniqueConstraint}
        ON ${DashboardsTableName} (project_uuid, slug)
    `);

    await withLockTimeout(knex, async (trx) => {
        if (!(await constraintExists(trx, ProjectSlugUniqueConstraint, 'u'))) {
            logProgress('attaching the project slug unique constraint');
            await trx.raw(`
                ALTER TABLE ${DashboardsTableName}
                ADD CONSTRAINT ${ProjectSlugUniqueConstraint}
                UNIQUE USING INDEX ${ProjectSlugUniqueConstraint}
            `);
        }
    });
}

async function enforceProjectNotNull(knex: Knex): Promise<void> {
    if (await isProjectUuidNotNull(knex)) {
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${DashboardsTableName}
                DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck}
            `);
        });
        return;
    }

    logProgress('validating the project UUID not-null constraint');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            VALIDATE CONSTRAINT ${ProjectNotNullCheck}
        `);
    });

    logProgress('setting project UUID NOT NULL');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            ALTER COLUMN project_uuid SET NOT NULL
        `);
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck}
        `);
    });
}

async function addAndValidateProjectForeignKey(knex: Knex): Promise<void> {
    if (!(await constraintExists(knex, ProjectForeignKey, 'f'))) {
        logProgress('adding the project foreign key without validation');
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${DashboardsTableName}
                ADD CONSTRAINT ${ProjectForeignKey}
                FOREIGN KEY (project_uuid)
                REFERENCES projects(project_uuid)
                ON DELETE CASCADE
                NOT VALID
            `);
        });
    }

    logProgress('validating the project foreign key');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            VALIDATE CONSTRAINT ${ProjectForeignKey}
        `);
    });
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await reconcileProjectUuids(knex);
        await addProjectNotNullCheck(knex);
        // Close the window between the initial repair and the check becoming
        // active. Rows inserted by an older application version in that window
        // are now protected from further null writes and can be repaired safely.
        await reconcileProjectUuids(knex);
        await deduplicateSlugs(knex);
        await createProjectSlugConstraint(knex);
        await enforceProjectNotNull(knex);
        await addAndValidateProjectForeignKey(knex);
        logProgress('project-scoped dashboard slug constraint complete');
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${DashboardsTableName}
            DROP CONSTRAINT IF EXISTS ${ProjectForeignKey},
            DROP CONSTRAINT IF EXISTS ${ProjectSlugUniqueConstraint},
            DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck},
            ALTER COLUMN project_uuid DROP NOT NULL
        `);
    });
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
    );
}
