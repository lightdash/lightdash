import { Knex } from 'knex';

export const config = { transaction: false };

const AppsTableName = 'apps';
const ProjectForeignKey = 'apps_project_uuid_foreign';
const ProjectNotNullCheck = 'apps_project_uuid_not_null';
const SlugNotNullCheck = 'apps_slug_not_null';
const ProjectSlugUniqueConstraint = 'apps_project_uuid_slug_unique';
const ProjectSlugLookupIndex = 'apps_project_uuid_slug_migration_idx';
const AppSlugSequence = 'apps_slug_sequence';
const BackfillBatchSize = 10000;
const RepairBatchSize = 1000;
const MaxGeneratedSlugLength = 255;
const LockTimeout = '5s';

/**
 * Adds the direct project-scoped slug contract for data apps.
 *
 * apps.project_uuid has been a NOT NULL project FK since the table was created.
 * This migration validates that historical ownership contract, then:
 *
 * 1. Adds a nullable slug with a sequence default for rolling compatibility.
 * 2. Backfills missing slugs from names, with an app sequence fallback.
 * 3. Adds a NOT VALID non-null check and backfills again.
 * 4. Repairs same-project duplicates in bounded batches.
 * 5. Builds the unique index concurrently and attaches it as a constraint.
 * 6. Validates and promotes the slug non-null check.
 *
 * Active apps win duplicate ties, but deleted apps still participate because
 * they can be restored. Every phase is idempotent and safe to resume after the
 * Knex migration lock has been released.
 */

const logProgress = (message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`  ${AppsTableName}: ${message}`);
};

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505';

async function withLockTimeout<T>(
    knex: Knex,
    callback: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
    return knex.transaction(async (trx) => {
        await trx.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
        return callback(trx);
    });
}

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
            ? [constraintName, AppsTableName, constraintType]
            : [constraintName, AppsTableName],
    );
    return getRowCount(result) > 0;
}

async function isColumnNotNull(
    knex: Knex,
    columnName: 'project_uuid' | 'slug',
): Promise<boolean> {
    const result = await knex.raw<{ rows: Array<{ attnotnull: boolean }> }>(
        `SELECT attnotnull
         FROM pg_attribute
         WHERE attrelid = ?::regclass
           AND attname = ?
           AND NOT attisdropped`,
        [AppsTableName, columnName],
    );
    return result.rows[0]?.attnotnull ?? false;
}

async function ensureSlugColumn(knex: Knex): Promise<void> {
    await knex.raw(`CREATE SEQUENCE IF NOT EXISTS ${AppSlugSequence}`);

    if (!(await knex.schema.hasColumn(AppsTableName, 'slug'))) {
        logProgress('adding the slug column');
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${AppsTableName}
                ADD COLUMN IF NOT EXISTS slug text
            `);
        });
    }

    // Older pods omit slug during a rolling deploy. The sequence keeps those
    // temporary slugs readable and collision-free.
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${AppsTableName}
            ALTER COLUMN slug
            SET DEFAULT ('app-' || nextval('${AppSlugSequence}')::text)
        `);
    });
}

async function ensureProjectContract(knex: Knex): Promise<void> {
    if (!(await isColumnNotNull(knex, 'project_uuid'))) {
        if (!(await constraintExists(knex, ProjectNotNullCheck))) {
            logProgress('adding the project UUID not-null check');
            await withLockTimeout(knex, async (trx) => {
                await trx.raw(`
                    ALTER TABLE ${AppsTableName}
                    ADD CONSTRAINT ${ProjectNotNullCheck}
                    CHECK (project_uuid IS NOT NULL)
                    NOT VALID
                `);
            });
        }

        logProgress('validating project UUID non-nullability');
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${AppsTableName}
                VALIDATE CONSTRAINT ${ProjectNotNullCheck}
            `);
        });
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${AppsTableName}
                ALTER COLUMN project_uuid SET NOT NULL,
                DROP CONSTRAINT IF EXISTS ${ProjectNotNullCheck}
            `);
        });
    }

    if (!(await constraintExists(knex, ProjectForeignKey, 'f'))) {
        logProgress('adding the project foreign key without validation');
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${AppsTableName}
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
            ALTER TABLE ${AppsTableName}
            VALIDATE CONSTRAINT ${ProjectForeignKey}
        `);
    });
}

async function backfillMissingSlugs(knex: Knex): Promise<void> {
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await withLockTimeout(knex, async (trx) =>
            trx.raw<{ rowCount: number }>(`
                WITH batch AS (
                    SELECT
                        app_id,
                        LEFT(
                            CASE
                                WHEN TRIM(
                                    BOTH '-' FROM REGEXP_REPLACE(
                                        LOWER(name),
                                        '[^a-z0-9]+',
                                        '-',
                                        'g'
                                    )
                                ) = ''
                                    THEN 'app-' ||
                                        nextval('${AppSlugSequence}')::text
                                ELSE TRIM(
                                    BOTH '-' FROM REGEXP_REPLACE(
                                        LOWER(name),
                                        '[^a-z0-9]+',
                                        '-',
                                        'g'
                                    )
                                )
                            END,
                            ${MaxGeneratedSlugLength}
                        ) AS slug
                    FROM ${AppsTableName}
                    WHERE slug IS NULL OR slug = ''
                    ORDER BY app_id
                    LIMIT ${BackfillBatchSize}
                )
                UPDATE ${AppsTableName} AS apps
                SET slug = batch.slug
                FROM batch
                WHERE apps.app_id = batch.app_id
                  AND (apps.slug IS NULL OR apps.slug = '')
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`backfilled slug for ${totalUpdated} rows`);
    }
}

async function addSlugNotNullCheck(knex: Knex): Promise<void> {
    if (
        (await isColumnNotNull(knex, 'slug')) ||
        (await constraintExists(knex, SlugNotNullCheck))
    ) {
        return;
    }

    logProgress('adding the slug not-null check');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${AppsTableName}
            ADD CONSTRAINT ${SlugNotNullCheck}
            CHECK (slug IS NOT NULL)
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
                        app_id,
                        project_uuid,
                        slug,
                        ROW_NUMBER() OVER (
                            PARTITION BY project_uuid, slug
                            ORDER BY
                                (deleted_at IS NULL) DESC,
                                created_at,
                                app_id
                        ) AS duplicate_number
                    FROM ${AppsTableName}
                ), duplicate_rows AS (
                    SELECT app_id, project_uuid, slug
                    FROM ranked
                    WHERE duplicate_number > 1
                    ORDER BY project_uuid, slug, app_id
                    LIMIT ${RepairBatchSize}
                ), replacements AS (
                    SELECT
                        duplicate_rows.app_id,
                        duplicate_rows.project_uuid,
                        duplicate_rows.slug AS original_slug,
                        replacement.candidate
                    FROM duplicate_rows
                    CROSS JOIN LATERAL (
                        WITH RECURSIVE candidate_numbers(candidate_number) AS (
                            SELECT nextval('${AppSlugSequence}')::text
                            UNION ALL
                            SELECT nextval('${AppSlugSequence}')::text
                            FROM candidate_numbers
                            WHERE EXISTS (
                                SELECT 1
                                FROM ${AppsTableName} AS existing
                                WHERE existing.project_uuid =
                                        duplicate_rows.project_uuid
                                  AND existing.slug =
                                        LEFT(
                                            duplicate_rows.slug,
                                            GREATEST(
                                                0,
                                                ${MaxGeneratedSlugLength} - 1 -
                                                CHAR_LENGTH(
                                                    candidate_numbers.candidate_number
                                                )
                                            )
                                        ) || '-' ||
                                        candidate_numbers.candidate_number
                                  AND existing.app_id <>
                                        duplicate_rows.app_id
                            )
                        )
                        SELECT
                            LEFT(
                                duplicate_rows.slug,
                                GREATEST(
                                    0,
                                    ${MaxGeneratedSlugLength} - 1 -
                                    CHAR_LENGTH(
                                        candidate_numbers.candidate_number
                                    )
                                )
                            ) || '-' ||
                            candidate_numbers.candidate_number AS candidate
                        FROM candidate_numbers
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM ${AppsTableName} AS existing
                            WHERE existing.project_uuid =
                                    duplicate_rows.project_uuid
                              AND existing.slug =
                                    LEFT(
                                        duplicate_rows.slug,
                                        GREATEST(
                                            0,
                                            ${MaxGeneratedSlugLength} - 1 -
                                            CHAR_LENGTH(
                                                candidate_numbers.candidate_number
                                            )
                                        )
                                    ) || '-' ||
                                    candidate_numbers.candidate_number
                              AND existing.app_id <> duplicate_rows.app_id
                        )
                        LIMIT 1
                    ) AS replacement
                )
                UPDATE ${AppsTableName} AS apps
                SET slug = replacements.candidate
                FROM replacements
                WHERE apps.app_id = replacements.app_id
                  AND apps.project_uuid = replacements.project_uuid
                  AND apps.slug = replacements.original_slug
            `),
        );
        const updated = getRowCount(result);
        if (updated === 0) break;
        totalUpdated += updated;
        logProgress(`deduplicated slug for ${totalUpdated} rows`);
    }
}

async function dropInvalidIndex(knex: Knex, indexName: string): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [indexName, AppsTableName],
    );
    if (getRowCount(invalidIndex) > 0) {
        logProgress(`dropping invalid index ${indexName} from a prior run`);
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`);
    }
}

async function ensureProjectSlugLookupIndex(knex: Knex): Promise<void> {
    await dropInvalidIndex(knex, ProjectSlugLookupIndex);
    logProgress(
        'building the temporary project slug lookup index concurrently',
    );
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${ProjectSlugLookupIndex}
        ON ${AppsTableName} (project_uuid, slug)
    `);
}

async function dropProjectSlugLookupIndex(knex: Knex): Promise<void> {
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugLookupIndex}`,
    );
}

async function createProjectSlugConstraint(knex: Knex): Promise<void> {
    if (await constraintExists(knex, ProjectSlugUniqueConstraint, 'u')) {
        await dropProjectSlugLookupIndex(knex);
        return;
    }

    await ensureProjectSlugLookupIndex(knex);

    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        await dropInvalidIndex(knex, ProjectSlugUniqueConstraint);
        // eslint-disable-next-line no-await-in-loop
        await deduplicateSlugs(knex);

        try {
            logProgress('building the project slug unique index concurrently');
            // eslint-disable-next-line no-await-in-loop
            await knex.raw(`
                CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
                    ${ProjectSlugUniqueConstraint}
                ON ${AppsTableName} (project_uuid, slug)
            `);
            break;
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            logProgress(
                'a concurrent duplicate appeared during index creation; retrying',
            );
        }
    }

    await withLockTimeout(knex, async (trx) => {
        if (!(await constraintExists(trx, ProjectSlugUniqueConstraint, 'u'))) {
            logProgress('attaching the project slug unique constraint');
            await trx.raw(`
                ALTER TABLE ${AppsTableName}
                ADD CONSTRAINT ${ProjectSlugUniqueConstraint}
                UNIQUE USING INDEX ${ProjectSlugUniqueConstraint}
            `);
        }
    });
    await dropProjectSlugLookupIndex(knex);
}

async function enforceSlugNotNull(knex: Knex): Promise<void> {
    if (await isColumnNotNull(knex, 'slug')) {
        await withLockTimeout(knex, async (trx) => {
            await trx.raw(`
                ALTER TABLE ${AppsTableName}
                DROP CONSTRAINT IF EXISTS ${SlugNotNullCheck}
            `);
        });
        return;
    }

    logProgress('validating slug non-nullability');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${AppsTableName}
            VALIDATE CONSTRAINT ${SlugNotNullCheck}
        `);
    });

    logProgress('setting slug NOT NULL');
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${AppsTableName}
            ALTER COLUMN slug SET NOT NULL,
            DROP CONSTRAINT IF EXISTS ${SlugNotNullCheck}
        `);
    });
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await ensureSlugColumn(knex);
        await ensureProjectContract(knex);
        await backfillMissingSlugs(knex);
        await addSlugNotNullCheck(knex);
        await backfillMissingSlugs(knex);
        await createProjectSlugConstraint(knex);
        await enforceSlugNotNull(knex);
        logProgress('project-scoped data app slug contract complete');
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${AppsTableName}
            DROP CONSTRAINT IF EXISTS ${ProjectSlugUniqueConstraint},
            DROP CONSTRAINT IF EXISTS ${SlugNotNullCheck}
        `);
    });
    await knex.raw(
        `DROP INDEX CONCURRENTLY IF EXISTS ${ProjectSlugUniqueConstraint}`,
    );
    await dropProjectSlugLookupIndex(knex);
    await withLockTimeout(knex, async (trx) => {
        await trx.raw(`
            ALTER TABLE ${AppsTableName}
            DROP COLUMN IF EXISTS slug
        `);
    });
    await knex.raw(`DROP SEQUENCE IF EXISTS ${AppSlugSequence}`);
}
