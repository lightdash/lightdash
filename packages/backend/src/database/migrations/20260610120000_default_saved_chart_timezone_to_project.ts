import { TimezoneSetting } from '@lightdash/common';
import { Knex } from 'knex';

const TABLE = 'saved_queries_versions';
const COLUMN = 'timezone';
const PROJECT_TIMEZONE_SETTING = 'project_timezone';
const USER_TIMEZONE_SETTING = 'user_timezone';
const NOT_NULL_CHECK = 'saved_queries_versions_timezone_not_null';
const BATCH_SIZE = 10000;

// Repurposes the nullable `timezone` column into the single timezone-setting
// column ('project_timezone' | 'user_timezone' | <IANA zone>), NOT NULL with a
// 'project_timezone' default. saved_queries_versions has millions of rows on
// large instances, so runs outside a transaction and avoids any long write
// lock; every step is idempotent so a partial run can be re-applied.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    // Session setting — no schema-builder equivalent.
    await knex.raw('SET statement_timeout = 0');
    try {
        // New rows default to the project-timezone setting.
        await knex.schema.alterTable(TABLE, (table) => {
            table
                .text(COLUMN)
                .defaultTo(PROJECT_TIMEZONE_SETTING)
                .alter({ alterNullable: false, alterType: false });
        });

        // Existing NULLs (charts that deferred resolution) become the default;
        // existing IANA zones are left as-is (still an override). BATCH_SIZE limits how
        // many rows ONE pass updates (to bound the lock/WAL per statement), NOT the
        // total. Each pass re-selects the *remaining* NULLs and flips them to a
        // non-NULL value, so the candidate set shrinks every pass; we repeat until
        // a pass updates 0 rows, i.e. no NULLs are left.
        console.log(
            `Backfilling null ${COLUMN} to ${PROJECT_TIMEZONE_SETTING}...`,
        );
        let updatedInPass: number;
        let totalUpdated = 0;
        do {
            // eslint-disable-next-line no-await-in-loop
            updatedInPass = await knex(TABLE)
                .update({ [COLUMN]: PROJECT_TIMEZONE_SETTING })
                .whereIn(
                    'ctid',
                    knex(TABLE)
                        .select('ctid')
                        .whereNull(COLUMN)
                        .limit(BATCH_SIZE),
                );
            totalUpdated += updatedInPass;
            console.log(
                `  ...backfilled ${updatedInPass} rows this pass (${totalUpdated} total)`,
            );
        } while (updatedInPass > 0);

        // Enforce NOT NULL. A plain SET NOT NULL would full-scan the (multi-
        // million row) table under an ACCESS EXCLUSIVE lock, blocking reads and
        // writes. Instead: add a CHECK NOT VALID (instant), VALIDATE it (only a
        // non-blocking SHARE UPDATE EXCLUSIVE lock), then SET NOT NULL is instant
        // because PG trusts the validated CHECK; finally drop the redundant CHECK.
        // (NOT VALID / VALIDATE have no knex schema-builder equivalent.)
        const existingCheck = await knex('pg_constraint')
            .where('conname', NOT_NULL_CHECK)
            .first();
        if (!existingCheck) {
            await knex.raw(
                `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IS NOT NULL) NOT VALID`,
                [TABLE, NOT_NULL_CHECK, COLUMN],
            );
        }
        console.log(`Validating ${NOT_NULL_CHECK}...`);
        await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
            TABLE,
            NOT_NULL_CHECK,
        ]);
        await knex.schema.alterTable(TABLE, (table) => {
            table.dropNullable(COLUMN);
        });
        // IF EXISTS keeps the drop idempotent on a re-applied run.
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
            TABLE,
            NOT_NULL_CHECK,
        ]);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    // Drops both NOT NULL and the default (the nullable, default-less builder).
    await knex.schema.alterTable(TABLE, (table) => {
        table.text(COLUMN).alter({ alterType: false });
    });
    // Restore v1-compatible data: keyword settings revert to NULL (no pin).
    // The column is nullable again here; type the row so null is accepted.
    await knex<{ timezone: TimezoneSetting | null }>(TABLE)
        .whereIn(COLUMN, [PROJECT_TIMEZONE_SETTING, USER_TIMEZONE_SETTING])
        .update({ timezone: null });
}
