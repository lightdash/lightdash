import { Knex } from 'knex';

export const config = { transaction: false };

const SavedQueriesTableName = 'saved_queries';
const ProjectForeignKey = 'saved_queries_project_uuid_foreign';
const ProjectNotNullCheck = 'saved_queries_project_uuid_not_null';
const ProjectSlugUniqueConstraint = 'saved_queries_project_uuid_slug_unique';
const OwnershipBatchSize = 1000;
const SlugRepairBatchSize = 10000;
const MaxGeneratedSlugLength = 255;
const ChartSlugSuffixLength = '-chart-'.length;
const LockTimeout = '5s';

const canonicalProjectUuid = (alias: string): string => `COALESCE(
    ${alias}_direct_project.project_uuid,
    ${alias}_dashboard_project.project_uuid
)`;

const ownershipJoins = (alias: string): string => `
    LEFT JOIN spaces AS ${alias}_direct_space
        ON ${alias}_direct_space.space_id = ${alias}.space_id
    LEFT JOIN projects AS ${alias}_direct_project
        ON ${alias}_direct_project.project_id = ${alias}_direct_space.project_id
    LEFT JOIN dashboards AS ${alias}_dashboard
        ON ${alias}_dashboard.dashboard_uuid = ${alias}.dashboard_uuid
    LEFT JOIN spaces AS ${alias}_dashboard_space
        ON ${alias}_dashboard_space.space_id = ${alias}_dashboard.space_id
    LEFT JOIN projects AS ${alias}_dashboard_project
        ON ${alias}_dashboard_project.project_id =
            ${alias}_dashboard_space.project_id
`;

/**
 * Contract phase for direct saved-chart ownership and project-scoped slugs.
 *
 * Saved charts are owned through one of the existing FK chains:
 *
 * saved_queries.space_id -> spaces.project_id -> projects.project_uuid
 *
 * or:
 *
 * saved_queries.dashboard_uuid -> dashboards.space_id
 *   -> spaces.project_id -> projects.project_uuid
 *
 * The application maintains exactly one of space_id or dashboard_uuid. Both
 * ownership chains end at spaces.project_id, which is a NOT NULL project FK.
 *
 * The migration runs without Knex's outer transaction so repairs can commit in
 * bounded batches and the unique index can be built concurrently. Every phase
 * is idempotent and safe to resume after the migration lock is released:
 *
 * 1. Reconcile direct owners from the canonical FK chains.
 * 2. Add a NOT VALID non-null check, immediately protecting new writes.
 * 3. Reconcile again to close the window before the check was installed.
 * 4. Validate/set NOT NULL and add/validate the project foreign key.
 * 5. Rename only same-project duplicate slugs in committed batches.
 * 6. Build the unique index concurrently and attach it as a constraint.
 *
 * Active rows win duplicate ties, but deleted rows still participate because
 * they can be restored. Existing unique slugs are never changed. Rollback
 * removes the database contract but intentionally keeps valid data repairs. A
 * hard-killed runner can still require its global Knex lock to be released
 * before another process resumes these idempotent phases.
 */

const logProgress = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`  ${SavedQueriesTableName}: ${message}`);
};

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505';

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
            ? [constraintName, SavedQueriesTableName, constraintType]
            : [constraintName, SavedQueriesTableName],
    );
    return getRowCount(result) > 0;
}

async function isProjectUuidNotNull(knex: Knex): Promise<boolean> {
    const result = await knex.raw<{ rows: Array<{ attnotnull: boolean }> }>(
        `SELECT attnotnull
         FROM pg_attribute
         WHERE attrelid = ?::regclass
           AND attname = 'project_uuid'
           AND NOT attisdropped`,
        [SavedQueriesTableName],
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

async function reconcileProjectUuids(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT
                        saved_queries.saved_query_id,
                        ${canonicalProjectUuid('saved_queries')} AS project_uuid
                    FROM ${SavedQueriesTableName} AS saved_queries
                    ${ownershipJoins('saved_queries')}
                    WHERE saved_queries.project_uuid IS DISTINCT FROM
                        ${canonicalProjectUuid('saved_queries')}
                    ORDER BY saved_queries.saved_query_id
                    LIMIT ${OwnershipBatchSize}
                )
                UPDATE ${SavedQueriesTableName} AS saved_queries
                SET project_uuid = batch.project_uuid
                FROM batch
                WHERE saved_queries.saved_query_id = batch.saved_query_id
                  AND saved_queries.project_uuid IS DISTINCT FROM
                      batch.project_uuid
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`reconciled project UUID for ${totalUpdated} rows`);
    }
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
            ALTER TABLE ${SavedQueriesTableName}
            ADD CONSTRAINT ${ProjectNotNullCheck}
            CHECK (project_uuid IS NOT NULL)
            NOT VALID
        `);
    });
}

async function deduplicateSlugs(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH ranked AS (
                    SELECT
                        saved_query_id,
                        project_uuid,
                        slug,
                        ROW_NUMBER() OVER (
                            PARTITION BY project_uuid, slug
                            ORDER BY
                                (deleted_at IS NULL) DESC,
                                created_at,
                                saved_query_id
                        ) AS duplicate_number
                    FROM ${SavedQueriesTableName}
                ), duplicate_rows AS (
                    SELECT saved_query_id, project_uuid, slug
                    FROM ranked
                    WHERE duplicate_number > 1
                    ORDER BY project_uuid, slug, saved_query_id
                    LIMIT ${SlugRepairBatchSize}
                ), replacements AS (
                    SELECT
                        duplicate_rows.saved_query_id,
                        duplicate_rows.project_uuid,
                        duplicate_rows.slug AS original_slug,
                        replacement.candidate
                    FROM duplicate_rows
                    CROSS JOIN LATERAL (
                        WITH RECURSIVE candidates(attempt, candidate) AS (
                            SELECT
                                0,
                                LEFT(
                                    duplicate_rows.slug,
                                    GREATEST(
                                        0,
                                        ${MaxGeneratedSlugLength} -
                                            ${ChartSlugSuffixLength} -
                                            CHAR_LENGTH(
                                                duplicate_rows.saved_query_id::text
                                            )
                                    )
                                ) || '-chart-' ||
                                    duplicate_rows.saved_query_id::text
                            UNION ALL
                            SELECT
                                candidates.attempt + 1,
                                LEFT(
                                    duplicate_rows.slug,
                                    GREATEST(
                                        0,
                                        ${MaxGeneratedSlugLength - 1} -
                                            ${ChartSlugSuffixLength} -
                                            CHAR_LENGTH(
                                                duplicate_rows.saved_query_id::text
                                            ) -
                                            CHAR_LENGTH(
                                                (candidates.attempt + 1)::text
                                            )
                                    )
                                ) || '-chart-' ||
                                    duplicate_rows.saved_query_id::text || '-' ||
                                    (candidates.attempt + 1)::text
                            FROM candidates
                            WHERE EXISTS (
                                SELECT 1
                                FROM ${SavedQueriesTableName} AS existing
                                WHERE existing.project_uuid =
                                        duplicate_rows.project_uuid
                                  AND existing.slug = candidates.candidate
                                  AND existing.saved_query_id <>
                                      duplicate_rows.saved_query_id
                            )
                        )
                        SELECT candidates.candidate
                        FROM candidates
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM ${SavedQueriesTableName} AS existing
                            WHERE existing.project_uuid =
                                    duplicate_rows.project_uuid
                              AND existing.slug = candidates.candidate
                              AND existing.saved_query_id <>
                                  duplicate_rows.saved_query_id
                        )
                        ORDER BY candidates.attempt
                        LIMIT 1
                    ) AS replacement
                )
                UPDATE ${SavedQueriesTableName} AS saved_queries
                SET slug = replacements.candidate
                FROM replacements
                WHERE saved_queries.saved_query_id =
                        replacements.saved_query_id
                  AND saved_queries.project_uuid =
                        replacements.project_uuid
                  AND saved_queries.slug = replacements.original_slug
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`deduplicated slug for ${totalUpdated} rows`);
    }
}

async function dropInvalidProjectSlugIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [ProjectSlugUniqueConstraint, SavedQueriesTableName],
    );
    if (getRowCount(invalidIndex) > 0) {
        logProgress('dropping an invalid project slug index from a prior run');
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
        );
    }
}

async function createProjectSlugConstraint(knex: Knex): Promise<void> {
    if (await constraintExists(knex, ProjectSlugUniqueConstraint, 'u')) {
        return;
    }

    for (;;) {
        // A duplicate can be written after the repair pass while the concurrent
        // index is building. Repair and retry without operator intervention.
        // eslint-disable-next-line no-await-in-loop
        await dropInvalidProjectSlugIndex(knex);
        try {
            logProgress('building the project slug unique index concurrently');
            // eslint-disable-next-line no-await-in-loop
            await knex.raw(`
                CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${ProjectSlugUniqueConstraint}
                ON ${SavedQueriesTableName} (project_uuid, slug)
            `);
            break;
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            logProgress(
                'a concurrent duplicate appeared during index creation; repairing and retrying',
            );
            // eslint-disable-next-line no-await-in-loop
            await dropInvalidProjectSlugIndex(knex);
            // eslint-disable-next-line no-await-in-loop
            await deduplicateSlugs(knex);
        }
    }

    await withLockTimeout(knex, async (trx) => {
        if (!(await constraintExists(trx, ProjectSlugUniqueConstraint, 'u'))) {
            logProgress('attaching the project slug unique constraint');
            await trx.raw(`
                ALTER TABLE ${SavedQueriesTableName}
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
                ALTER TABLE ${SavedQueriesTableName}
                DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck}
            `);
        });
        return;
    }

    logProgress('validating the project UUID not-null constraint');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${SavedQueriesTableName}
            VALIDATE CONSTRAINT ${ProjectNotNullCheck}
        `);
    });

    logProgress('setting project UUID NOT NULL');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${SavedQueriesTableName}
            ALTER COLUMN project_uuid SET NOT NULL,
            DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck}
        `);
    });
}

async function addAndValidateProjectForeignKey(knex: Knex): Promise<void> {
    if (!(await constraintExists(knex, ProjectForeignKey, 'f'))) {
        logProgress('adding the project foreign key without validation');
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${SavedQueriesTableName}
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
            ALTER TABLE ${SavedQueriesTableName}
            VALIDATE CONSTRAINT ${ProjectForeignKey}
        `);
    });
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await reconcileProjectUuids(knex);
        await addProjectNotNullCheck(knex);
        await reconcileProjectUuids(knex);
        await enforceProjectNotNull(knex);
        await addAndValidateProjectForeignKey(knex);
        await deduplicateSlugs(knex);
        await createProjectSlugConstraint(knex);
        logProgress('project-scoped chart slug constraint complete');
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${SavedQueriesTableName}
                DROP CONSTRAINT IF EXISTS ${ProjectForeignKey},
                DROP CONSTRAINT IF EXISTS ${ProjectSlugUniqueConstraint},
                DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck},
                ALTER COLUMN project_uuid DROP NOT NULL
            `);
        });
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
