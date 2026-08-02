import { Knex } from 'knex';

export const config = { transaction: false };

const SpacesTableName = 'spaces';
const ProjectSlugUniqueConstraint = 'spaces_project_id_slug_unique';
const BatchSize = 1000;
const LockTimeout = '5s';

/**
 * Enforces project-scoped space slugs using the existing ownership chain:
 *
 * spaces.project_id (NOT NULL FK, CASCADE) -> projects.project_id
 *
 * Duplicate repair includes deleted spaces because they can be restored. The
 * active, oldest row keeps the existing slug; only conflicts are changed, using
 * the space primary key as a deterministic suffix. Space paths are intentionally
 * preserved because they are separate hierarchy/content-as-code identifiers.
 *
 * This migration runs without Knex's outer transaction so repairs can commit in
 * bounded batches and the unique index can be built concurrently. Every phase is
 * idempotent: an interrupted run can be retried after the migration lock is
 * released, including a failed concurrent index build.
 */

const logProgress = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`  ${SpacesTableName}: ${message}`);
};

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505';

async function constraintExists(knex: Knex): Promise<boolean> {
    const result = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_constraint
         WHERE conname = ?
           AND conrelid = ?::regclass
           AND contype = 'u'`,
        [ProjectSlugUniqueConstraint, SpacesTableName],
    );
    return getRowCount(result) > 0;
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

async function deduplicateSlugs(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH ranked AS (
                    SELECT
                        space_id,
                        project_id,
                        slug,
                        ROW_NUMBER() OVER (
                            PARTITION BY project_id, slug
                            ORDER BY
                                (deleted_at IS NULL) DESC,
                                created_at,
                                space_id
                        ) AS duplicate_number
                    FROM ${SpacesTableName}
                ), duplicate_rows AS (
                    SELECT space_id, project_id, slug
                    FROM ranked
                    WHERE duplicate_number > 1
                    ORDER BY project_id, slug, space_id
                    LIMIT ${BatchSize}
                ), replacements AS (
                    SELECT
                        duplicate_rows.space_id,
                        duplicate_rows.project_id,
                        duplicate_rows.slug AS original_slug,
                        replacement.candidate
                    FROM duplicate_rows
                    CROSS JOIN LATERAL (
                        WITH RECURSIVE candidates(attempt, candidate) AS (
                            SELECT
                                0,
                                duplicate_rows.slug || '-' ||
                                    duplicate_rows.space_id::text
                            UNION ALL
                            SELECT
                                candidates.attempt + 1,
                                duplicate_rows.slug || '-' ||
                                    duplicate_rows.space_id::text || '-' ||
                                    (candidates.attempt + 1)::text
                            FROM candidates
                            WHERE EXISTS (
                                SELECT 1
                                FROM ${SpacesTableName} AS existing
                                WHERE existing.project_id = duplicate_rows.project_id
                                  AND existing.slug = candidates.candidate
                                  AND existing.space_id <> duplicate_rows.space_id
                            )
                        )
                        SELECT candidates.candidate
                        FROM candidates
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM ${SpacesTableName} AS existing
                            WHERE existing.project_id = duplicate_rows.project_id
                              AND existing.slug = candidates.candidate
                              AND existing.space_id <> duplicate_rows.space_id
                        )
                        ORDER BY candidates.attempt
                        LIMIT 1
                    ) AS replacement
                )
                UPDATE ${SpacesTableName} AS spaces
                SET slug = replacements.candidate
                FROM replacements
                WHERE spaces.space_id = replacements.space_id
                  AND spaces.project_id = replacements.project_id
                  AND spaces.slug = replacements.original_slug
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`deduplicated slug for ${totalUpdated} rows`);
    }
}

async function dropInvalidIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [ProjectSlugUniqueConstraint, SpacesTableName],
    );
    if (getRowCount(invalidIndex) > 0) {
        logProgress('dropping an invalid project slug index from a prior run');
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
        );
    }
}

async function createProjectSlugConstraint(knex: Knex): Promise<void> {
    if (await constraintExists(knex)) return;

    for (;;) {
        // CREATE UNIQUE INDEX CONCURRENTLY can leave an INVALID index when it
        // observes a duplicate written after the repair pass. Remove it and
        // repair/retry without requiring an operator to edit database state.
        // eslint-disable-next-line no-await-in-loop
        await dropInvalidIndex(knex);
        try {
            logProgress('building the project slug unique index concurrently');
            // eslint-disable-next-line no-await-in-loop
            await knex.raw(`
                CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${ProjectSlugUniqueConstraint}
                ON ${SpacesTableName} (project_id, slug)
            `);
            break;
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            logProgress(
                'a concurrent duplicate appeared during index creation; repairing and retrying',
            );
            // eslint-disable-next-line no-await-in-loop
            await dropInvalidIndex(knex);
            // eslint-disable-next-line no-await-in-loop
            await deduplicateSlugs(knex);
        }
    }

    await withLockTimeout(knex, async (trx) => {
        if (!(await constraintExists(trx))) {
            logProgress('attaching the project slug unique constraint');
            await trx.raw(`
                ALTER TABLE ${SpacesTableName}
                ADD CONSTRAINT ${ProjectSlugUniqueConstraint}
                UNIQUE USING INDEX ${ProjectSlugUniqueConstraint}
            `);
        }
    });
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await deduplicateSlugs(knex);
        await createProjectSlugConstraint(knex);
        logProgress('project-scoped space slug constraint complete');
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${SpacesTableName}
                DROP CONSTRAINT IF EXISTS ${ProjectSlugUniqueConstraint}
            `);
        });
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
