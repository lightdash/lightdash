import { Knex } from 'knex';

const TABLE = 'saved_queries_versions';
const PRIMARY_KEY = 'saved_queries_version_id';
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

type VersionId = number | string;

// Sets NULL timezones to the default, walking the table in primary-key order
// (keyset pagination) from `startAfter` (exclusive) to the end. Each pass finds
// the upper bound of the next BATCH_SIZE ids through the primary key index,
// then updates the NULLs in that id range, so every pass reads a bounded slice
// of the table and the whole walk reads it once, however sparse the remaining
// NULLs are. (Re-selecting `WHERE timezone IS NULL LIMIT n` each pass has no
// index to use: once NULLs got sparse, every pass sequentially scanned the
// whole table, dead tuples included, to update a handful of rows, and rows
// still being written with NULL kept it from ever reaching an empty pass.)
// The last pass has no upper bound, so rows inserted while the walk ran are
// included. Returns where that last pass started, for a cheap catch-up walk.
async function backfillNullTimezones(
    knex: Knex,
    startAfter: VersionId | undefined,
): Promise<VersionId | undefined> {
    let rangeStart = startAfter;
    let totalUpdated = 0;
    for (;;) {
        const from = rangeStart;
        // eslint-disable-next-line no-await-in-loop
        const upperBound: Record<string, VersionId> | undefined = await knex(
            TABLE,
        )
            .select(PRIMARY_KEY)
            .modify((query) => {
                if (from !== undefined)
                    void query.where(PRIMARY_KEY, '>', from);
            })
            .orderBy(PRIMARY_KEY)
            .offset(BATCH_SIZE - 1)
            .limit(1)
            .first();
        const rangeEnd = upperBound?.[PRIMARY_KEY];
        // eslint-disable-next-line no-await-in-loop
        const updatedInPass: number = await knex(TABLE)
            .update({ [COLUMN]: PROJECT_TIMEZONE_SETTING })
            .whereNull(COLUMN)
            .modify((query) => {
                if (from !== undefined)
                    void query.where(PRIMARY_KEY, '>', from);
                if (rangeEnd !== undefined) {
                    void query.where(PRIMARY_KEY, '<=', rangeEnd);
                }
            });
        totalUpdated += updatedInPass;
        console.log(
            `  ...backfilled ${updatedInPass} rows up to ${PRIMARY_KEY} ${
                rangeEnd ?? 'end'
            } (${totalUpdated} total)`,
        );
        if (rangeEnd === undefined) return from;
        rangeStart = rangeEnd;
    }
}

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
        // existing IANA zones are left as-is (still an override). Resuming a
        // partial run is safe: id ranges already done have no NULLs left.
        console.log(
            `Backfilling null ${COLUMN} to ${PROJECT_TIMEZONE_SETTING}...`,
        );
        const lastRangeStart = await backfillNullTimezones(knex, undefined);

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
        // The NOT VALID check rejects NULLs written from now on, but a row
        // written with NULL after the backfill's last pass and before the
        // check existed would make VALIDATE fail. Catch those up; new rows only
        // ever get higher ids, so the walk restarts where the last pass began
        // instead of reading the table again.
        console.log(
            `Catching up null ${COLUMN} written during the backfill...`,
        );
        await backfillNullTimezones(knex, lastRangeStart);
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
    await knex<{ timezone: string | null }>(TABLE)
        .whereIn(COLUMN, [PROJECT_TIMEZONE_SETTING, USER_TIMEZONE_SETTING])
        .update({ timezone: null });
}
