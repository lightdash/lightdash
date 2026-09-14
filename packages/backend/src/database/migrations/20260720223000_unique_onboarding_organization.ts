import { Knex } from 'knex';

const ONBOARDING_TABLE_NAME = 'onboarding';
const ONBOARDING_ORGANIZATION_UNIQUE = 'onboarding_organization_id_unique';
const MAX_UNIQUE_INDEX_ATTEMPTS = 3;

// CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction, so every
// step below must be safe to re-run.
export const config = { transaction: false };

async function constraintExists(knex: Knex): Promise<boolean> {
    const result = await knex.raw(
        `
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = ?::regclass
          AND conname = ?
    `,
        [ONBOARDING_TABLE_NAME, ONBOARDING_ORGANIZATION_UNIQUE],
    );
    return result.rows.length > 0;
}

async function hasInvalidUniqueIndex(knex: Knex): Promise<boolean> {
    const result = await knex.raw(
        `
        SELECT 1
        FROM pg_class c
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = ?
          AND NOT i.indisvalid
    `,
        [ONBOARDING_ORGANIZATION_UNIQUE],
    );
    return result.rows.length > 0;
}

// All three timestamps are first-occurrence, so MIN keeps the true first
// date while still preserving any non-NULL value a duplicate holds.
async function mergeAndRemoveDuplicates(knex: Knex): Promise<void> {
    await knex.raw(`
        WITH merged_progress AS (
            SELECT
                organization_id,
                MIN(onboarding_id) AS survivor_id,
                MIN("ranQuery_at") AS "ranQuery_at",
                MIN("shownSuccess_at") AS "shownSuccess_at",
                MIN(playground_project_deleted_at) AS playground_project_deleted_at
            FROM ${ONBOARDING_TABLE_NAME}
            GROUP BY organization_id
            HAVING COUNT(*) > 1
        )
        UPDATE ${ONBOARDING_TABLE_NAME} survivor
        SET
            "ranQuery_at" = merged_progress."ranQuery_at",
            "shownSuccess_at" = merged_progress."shownSuccess_at",
            playground_project_deleted_at = merged_progress.playground_project_deleted_at
        FROM merged_progress
        WHERE survivor.onboarding_id = merged_progress.survivor_id
    `);
    await knex.raw(`
        DELETE FROM ${ONBOARDING_TABLE_NAME} duplicate
        USING ${ONBOARDING_TABLE_NAME} original
        WHERE duplicate.organization_id = original.organization_id
          AND duplicate.onboarding_id > original.onboarding_id
    `);
}

export async function up(knex: Knex): Promise<void> {
    if (await constraintExists(knex)) {
        return;
    }
    /* eslint-disable no-await-in-loop */
    for (let attempt = 1; attempt <= MAX_UNIQUE_INDEX_ATTEMPTS; attempt += 1) {
        // A failed CONCURRENTLY build leaves an INVALID index behind that
        // IF NOT EXISTS would wrongly skip.
        if (await hasInvalidUniqueIndex(knex)) {
            await knex.raw(`DROP INDEX ${ONBOARDING_ORGANIZATION_UNIQUE}`);
        }
        await mergeAndRemoveDuplicates(knex);
        try {
            await knex.raw(`
                CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${ONBOARDING_ORGANIZATION_UNIQUE}
                ON ${ONBOARDING_TABLE_NAME} (organization_id)
            `);
            break;
        } catch (error) {
            if (attempt === MAX_UNIQUE_INDEX_ATTEMPTS) {
                throw error;
            }
        }
    }
    /* eslint-enable no-await-in-loop */
    await knex.raw(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conrelid = '${ONBOARDING_TABLE_NAME}'::regclass
                  AND conname = '${ONBOARDING_ORGANIZATION_UNIQUE}'
            ) THEN
                ALTER TABLE ${ONBOARDING_TABLE_NAME}
                ADD CONSTRAINT ${ONBOARDING_ORGANIZATION_UNIQUE}
                UNIQUE USING INDEX ${ONBOARDING_ORGANIZATION_UNIQUE};
            END IF;
        END
        $$
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${ONBOARDING_TABLE_NAME}
        DROP CONSTRAINT IF EXISTS ${ONBOARDING_ORGANIZATION_UNIQUE}
    `);
    await knex.raw(`
        DROP INDEX IF EXISTS ${ONBOARDING_ORGANIZATION_UNIQUE}
    `);
}
