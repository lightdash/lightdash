import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Relaxes NOT NULLs, adds a nullable FK column, a validated CHECK and a concurrent partial index; drops an FK on an ephemeral counter table. Old pods keep writing app-target rows that satisfy every new constraint.',
} as const;

// Concurrent index build + NOT VALID/VALIDATE steps; every statement is
// guarded so a retry resumes.
export const config = { transaction: false };

const analysesTable = 'data_app_analyses';
const countersTable = 'data_app_analysis_rate_counters';
const checkName = 'data_app_analyses_one_target_check';
const dashboardReuseIndex = 'data_app_analyses_dashboard_reuse_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        // Analyses: app columns become one side of a target union.
        await knex.raw(
            `ALTER TABLE ${analysesTable} ALTER COLUMN app_id DROP NOT NULL`,
        );
        await knex.raw(
            `ALTER TABLE ${analysesTable} ALTER COLUMN app_version DROP NOT NULL`,
        );
        // Column, FK and index each guarded on their own: with
        // transaction: false these are separate statements, and a retry must
        // resume at exactly the missing piece.
        await knex.raw(
            `ALTER TABLE ${analysesTable} ADD COLUMN IF NOT EXISTS dashboard_uuid uuid`,
        );
        await knex.raw(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = '${analysesTable}_dashboard_uuid_foreign'
                ) THEN
                    ALTER TABLE ${analysesTable}
                    ADD CONSTRAINT ${analysesTable}_dashboard_uuid_foreign
                    FOREIGN KEY (dashboard_uuid)
                    REFERENCES dashboards(dashboard_uuid) ON DELETE CASCADE;
                END IF;
            END $$;
        `);
        await knex.raw(
            `CREATE INDEX IF NOT EXISTS ${analysesTable}_dashboard_uuid_index ON ${analysesTable} (dashboard_uuid)`,
        );
        // Exactly one target per row. NOT VALID + VALIDATE so existing rows
        // are checked without an exclusive-lock table scan.
        await knex.raw(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = '${checkName}'
                ) THEN
                    ALTER TABLE ${analysesTable} ADD CONSTRAINT ${checkName}
                    CHECK (
                        (app_id IS NOT NULL AND app_version IS NOT NULL AND dashboard_uuid IS NULL)
                        OR (app_id IS NULL AND app_version IS NULL AND dashboard_uuid IS NOT NULL)
                    ) NOT VALID;
                END IF;
            END $$;
        `);
        await knex.raw(
            `ALTER TABLE ${analysesTable} VALIDATE CONSTRAINT ${checkName}`,
        );

        // Rate counters: app_id sits in the PK, so it cannot go nullable.
        // It becomes the generic target uuid (app or dashboard — uuids are
        // globally unique); the FK to apps has to go for dashboard targets.
        // Rows live minutes and the daily sweep cleans them, so losing the
        // cascade is harmless.
        await knex.raw(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = '${countersTable}_app_id_foreign'
                ) THEN
                    ALTER TABLE ${countersTable}
                    DROP CONSTRAINT ${countersTable}_app_id_foreign;
                END IF;
            END $$;
        `);
        await knex.raw(
            `COMMENT ON COLUMN ${countersTable}.app_id IS 'Target uuid: an app or a dashboard. Named for its original app-only scope.'`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }

    // An interrupted concurrent build leaves an invalid index that
    // IF NOT EXISTS would keep; drop it so the retry rebuilds a usable one.
    // Validity is checked in TypeScript because DROP INDEX CONCURRENTLY
    // cannot run inside a DO block (it refuses any transaction context).
    const invalidIndex = await knex.raw(`
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = '${dashboardReuseIndex}' AND NOT i.indisvalid
    `);
    if (invalidIndex.rows.length > 0) {
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${dashboardReuseIndex}`,
        );
    }
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${dashboardReuseIndex} ON ${analysesTable} (dashboard_uuid, content_hash, created_at DESC) WHERE operation = 'detect' AND dashboard_uuid IS NOT NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${dashboardReuseIndex}`);
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        // Dashboard-target rows are disposable caches; remove them so the
        // app-only shape can be restored.
        await knex(analysesTable).whereNotNull('dashboard_uuid').delete();
        await knex.raw(
            `ALTER TABLE ${analysesTable} DROP CONSTRAINT IF EXISTS ${checkName}`,
        );
        if (await knex.schema.hasColumn(analysesTable, 'dashboard_uuid')) {
            await knex.schema.alterTable(analysesTable, (table) => {
                table.dropColumn('dashboard_uuid');
            });
        }
        await knex.raw(
            `ALTER TABLE ${analysesTable} ALTER COLUMN app_id SET NOT NULL`,
        );
        await knex.raw(
            `ALTER TABLE ${analysesTable} ALTER COLUMN app_version SET NOT NULL`,
        );

        // Counters: drop rows that no longer reference an app, then restore
        // the FK.
        await knex.raw(`
            DELETE FROM ${countersTable} c
            WHERE NOT EXISTS (SELECT 1 FROM apps a WHERE a.app_id = c.app_id)
        `);
        await knex.raw(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = '${countersTable}_app_id_foreign'
                ) THEN
                    ALTER TABLE ${countersTable}
                    ADD CONSTRAINT ${countersTable}_app_id_foreign
                    FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE;
                END IF;
            END $$;
        `);
        await knex.raw(`COMMENT ON COLUMN ${countersTable}.app_id IS NULL`);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
