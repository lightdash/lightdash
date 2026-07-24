import { Knex } from 'knex';

export const config = { transaction: false };

const SavedSqlTableName = 'saved_sql';
const ProjectSlugUniqueConstraint = 'saved_sql_project_uuid_slug_unique';
const ProjectNotNullCheck = 'saved_sql_project_uuid_not_null_check';
const SlugNotNullCheck = 'saved_sql_slug_not_null_check';
const BatchSize = 1000;
const LockTimeout = '5s';

const canonicalProjectUuid = (alias: string): string => `COALESCE(
    ${alias}_direct_project.project_uuid,
    ${alias}_dashboard_project.project_uuid
)`;

const ownershipJoins = (alias: string): string => `
    LEFT JOIN spaces AS ${alias}_direct_space
        ON ${alias}_direct_space.space_uuid = ${alias}.space_uuid
    LEFT JOIN projects AS ${alias}_direct_project
        ON ${alias}_direct_project.project_id = ${alias}_direct_space.project_id
    LEFT JOIN dashboards AS ${alias}_dashboard
        ON ${alias}_dashboard.dashboard_uuid = ${alias}.dashboard_uuid
    LEFT JOIN spaces AS ${alias}_dashboard_space
        ON ${alias}_dashboard_space.space_id = ${alias}_dashboard.space_id
    LEFT JOIN projects AS ${alias}_dashboard_project
        ON ${alias}_dashboard_project.project_id = ${alias}_dashboard_space.project_id
`;

/**
 * saved_sql has had a native project UUID FK and UNIQUE(project_uuid, slug)
 * since its creation. This migration closes the nullable loopholes without
 * changing valid slugs.
 *
 * Ownership is always resolvable through one of the existing FK chains:
 *
 * saved_sql.space_uuid -> spaces.project_id -> projects.project_uuid
 *
 * or:
 *
 * saved_sql.dashboard_uuid -> dashboards.space_id
 *   -> spaces.project_id -> projects.project_uuid
 *
 * Project UUIDs are reconciled from their space, or from their dashboard's
 * space. Only a slug that would conflict after an ownership repair is
 * deterministically suffixed with the chart UUID. Deleted rows participate
 * because they can be restored. NULL slugs receive a UUID-based value.
 *
 * Repairs commit in bounded batches. Every phase is idempotent, so an
 * interrupted run can be retried after releasing the Knex migration lock.
 */

const logProgress = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`  ${SavedSqlTableName}: ${message}`);
};

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

async function withLockTimeout<T>(
    knex: Knex,
    callback: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
    return knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        return callback(trx);
    });
}

async function assertHistoricalConstraint(knex: Knex): Promise<void> {
    const constraint = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_constraint
         WHERE conname = ?
           AND conrelid = ?::regclass
           AND contype = 'u'`,
        [ProjectSlugUniqueConstraint, SavedSqlTableName],
    );
    if (getRowCount(constraint) === 0) {
        throw new Error(
            `${SavedSqlTableName}: historical project slug constraint is missing`,
        );
    }
}

async function backfillNullSlugs(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // UUID-based values are deterministic. The recursive fallback handles
        // even a deliberately colliding pre-existing slug.
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT saved_sql.saved_sql_uuid,
                        ${canonicalProjectUuid('saved_sql')} AS project_uuid
                    FROM ${SavedSqlTableName} AS saved_sql
                    ${ownershipJoins('saved_sql')}
                    WHERE saved_sql.slug IS NULL
                    ORDER BY saved_sql.saved_sql_uuid
                    LIMIT ${BatchSize}
                ), replacements AS (
                    SELECT batch.saved_sql_uuid, replacement.candidate
                    FROM batch
                    CROSS JOIN LATERAL (
                        WITH RECURSIVE candidates(attempt, candidate) AS (
                            SELECT 0,
                                'sql-chart-' || batch.saved_sql_uuid::text
                            UNION ALL
                            SELECT candidates.attempt + 1,
                                'sql-chart-' || batch.saved_sql_uuid::text ||
                                    '-' || (candidates.attempt + 1)::text
                            FROM candidates
                            WHERE EXISTS (
                                SELECT 1
                                FROM ${SavedSqlTableName} AS existing
                                WHERE existing.project_uuid = batch.project_uuid
                                  AND existing.slug = candidates.candidate
                            )
                        )
                        SELECT candidates.candidate
                        FROM candidates
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM ${SavedSqlTableName} AS existing
                            WHERE existing.project_uuid = batch.project_uuid
                              AND existing.slug = candidates.candidate
                        )
                        ORDER BY candidates.attempt
                        LIMIT 1
                    ) AS replacement
                )
                UPDATE ${SavedSqlTableName} AS saved_sql
                SET slug = replacements.candidate
                FROM replacements
                WHERE saved_sql.saved_sql_uuid = replacements.saved_sql_uuid
                  AND saved_sql.slug IS NULL
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`backfilled slug for ${totalUpdated} rows`);
    }
}

async function repairOwnershipSlugConflicts(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // Rank canonical ownership groups before reconciliation so an active
        // chart keeps its slug over a deleted one.
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH resolved AS (
                    SELECT saved_sql.saved_sql_uuid, saved_sql.slug,
                        ${canonicalProjectUuid('saved_sql')} AS project_uuid,
                        ROW_NUMBER() OVER (
                            PARTITION BY ${canonicalProjectUuid('saved_sql')}, saved_sql.slug
                            ORDER BY
                                (saved_sql.deleted_at IS NULL) DESC,
                                saved_sql.created_at,
                                saved_sql.saved_sql_uuid
                        ) AS duplicate_number
                    FROM ${SavedSqlTableName} AS saved_sql
                    ${ownershipJoins('saved_sql')}
                ), conflicts AS (
                    SELECT resolved.*
                    FROM resolved
                    WHERE resolved.duplicate_number > 1
                    ORDER BY resolved.project_uuid, resolved.slug,
                        resolved.saved_sql_uuid
                    LIMIT ${BatchSize}
                ), replacements AS (
                    SELECT conflicts.saved_sql_uuid, replacement.candidate
                    FROM conflicts
                    CROSS JOIN LATERAL (
                        WITH RECURSIVE candidates(attempt, candidate) AS (
                            SELECT 0,
                                LEFT(conflicts.slug, 210) || '-sql-' ||
                                    conflicts.saved_sql_uuid::text
                            UNION ALL
                            SELECT candidates.attempt + 1,
                                LEFT(conflicts.slug, 200) || '-sql-' ||
                                    conflicts.saved_sql_uuid::text || '-' ||
                                    (candidates.attempt + 1)::text
                            FROM candidates
                            WHERE EXISTS (
                                SELECT 1
                                FROM ${SavedSqlTableName} AS existing
                                ${ownershipJoins('existing')}
                                WHERE ${canonicalProjectUuid('existing')} =
                                        conflicts.project_uuid
                                  AND existing.slug = candidates.candidate
                                  AND existing.saved_sql_uuid <>
                                      conflicts.saved_sql_uuid
                            )
                        )
                        SELECT candidates.candidate
                        FROM candidates
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM ${SavedSqlTableName} AS existing
                            ${ownershipJoins('existing')}
                            WHERE ${canonicalProjectUuid('existing')} =
                                    conflicts.project_uuid
                              AND existing.slug = candidates.candidate
                              AND existing.saved_sql_uuid <>
                                  conflicts.saved_sql_uuid
                        )
                        ORDER BY candidates.attempt
                        LIMIT 1
                    ) AS replacement
                )
                UPDATE ${SavedSqlTableName} AS saved_sql
                SET slug = replacements.candidate
                FROM replacements
                WHERE saved_sql.saved_sql_uuid = replacements.saved_sql_uuid
                  AND saved_sql.slug IS DISTINCT FROM replacements.candidate
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(
            `repaired ownership slug conflict for ${totalUpdated} rows`,
        );
    }
}

async function reconcileProjectUuids(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT saved_sql.saved_sql_uuid,
                        ${canonicalProjectUuid('saved_sql')} AS project_uuid
                    FROM ${SavedSqlTableName} AS saved_sql
                    ${ownershipJoins('saved_sql')}
                    WHERE saved_sql.project_uuid IS DISTINCT FROM
                        ${canonicalProjectUuid('saved_sql')}
                    ORDER BY saved_sql.saved_sql_uuid
                    LIMIT ${BatchSize}
                )
                UPDATE ${SavedSqlTableName} AS saved_sql
                SET project_uuid = batch.project_uuid
                FROM batch
                WHERE saved_sql.saved_sql_uuid = batch.saved_sql_uuid
                  AND saved_sql.project_uuid IS DISTINCT FROM batch.project_uuid
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`reconciled project UUID for ${totalUpdated} rows`);
    }
}

async function enforceNotNull(
    knex: Knex,
    columnName: 'project_uuid' | 'slug',
    checkName: string,
): Promise<void> {
    const column = await knex.raw<{ rows: Array<{ attnotnull: boolean }> }>(
        `SELECT attnotnull
         FROM pg_attribute
         WHERE attrelid = ?::regclass
           AND attname = ?
           AND NOT attisdropped`,
        [SavedSqlTableName, columnName],
    );
    if (column.rows[0]?.attnotnull) return;

    const check = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass`,
        [checkName, SavedSqlTableName],
    );
    if (getRowCount(check) === 0) {
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${SavedSqlTableName}
                ADD CONSTRAINT ${checkName}
                CHECK (${columnName} IS NOT NULL) NOT VALID
            `);
        });
    }

    logProgress(`validating ${columnName} non-nullability`);
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${SavedSqlTableName}
            VALIDATE CONSTRAINT ${checkName}
        `);
    });

    await withLockTimeout(knex, async (trx) => {
        logProgress(`enforcing ${columnName} NOT NULL`);
        await trx.raw(`
            ALTER TABLE ${SavedSqlTableName}
            ALTER COLUMN ${columnName} SET NOT NULL,
            DROP CONSTRAINT IF EXISTS ${checkName}
        `);
    });
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await assertHistoricalConstraint(knex);
        await backfillNullSlugs(knex);
        await repairOwnershipSlugConflicts(knex);
        await reconcileProjectUuids(knex);
        await enforceNotNull(knex, 'project_uuid', ProjectNotNullCheck);
        await enforceNotNull(knex, 'slug', SlugNotNullCheck);
        logProgress('project-scoped SQL chart slug contract complete');
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${SavedSqlTableName}
            ALTER COLUMN project_uuid DROP NOT NULL,
            ALTER COLUMN slug DROP NOT NULL,
            DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck},
            DROP CONSTRAINT IF EXISTS ${SlugNotNullCheck}
        `);
    });
}
