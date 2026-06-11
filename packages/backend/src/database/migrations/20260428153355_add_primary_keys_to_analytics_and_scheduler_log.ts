import { Knex } from 'knex';

// Disable transaction wrapping so CREATE INDEX CONCURRENTLY can be used and
// the long-running batched backfill is not held in a single transaction.
// Each statement runs in its own implicit transaction. The migration is
// idempotent so a partial run can be safely resumed by re-running.
export const config = { transaction: false };

const TABLES: ReadonlyArray<{ table: string; column: string }> = [
    { table: 'analytics_chart_views', column: 'analytics_chart_view_uuid' },
    {
        table: 'analytics_dashboard_views',
        column: 'analytics_dashboard_view_uuid',
    },
    { table: 'analytics_app_views', column: 'analytics_app_view_uuid' },
    { table: 'scheduler_log', column: 'scheduler_log_uuid' },
];

const BATCH_SIZE = 10000;

async function addPrimaryKey(
    knex: Knex,
    table: string,
    column: string,
): Promise<void> {
    const pkName = `${table}_pkey`;
    const checkName = `${column}_not_null`;

    // 1. Add nullable column without default. PG records the default in the
    //    catalog only; this is instant regardless of table size.
    await knex.raw(`ALTER TABLE ?? ADD COLUMN IF NOT EXISTS ?? uuid`, [
        table,
        column,
    ]);

    // 2. Attach the default so any new INSERTs auto-populate the column while
    //    the backfill is running.
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT uuid_generate_v4()`,
        [table, column],
    );

    // 3. Backfill existing rows in bounded batches so we never hold a long
    //    write lock and never bloat the WAL with one giant UPDATE.
    let totalUpdated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex.raw<{ rowCount: number }>(
            `UPDATE ?? SET ?? = uuid_generate_v4()
             WHERE ctid IN (
                 SELECT ctid FROM ?? WHERE ?? IS NULL LIMIT ${BATCH_SIZE}
             )`,
            [table, column, table, column],
        );
        const updated = result.rowCount ?? 0;
        if (updated === 0) break;
        totalUpdated += updated;
        // eslint-disable-next-line no-console
        console.log(`  ${table}: backfilled ${totalUpdated} rows`);
    }

    // 4. Add a CHECK (col IS NOT NULL) NOT VALID, then VALIDATE it. VALIDATE
    //    only takes SHARE UPDATE EXCLUSIVE — concurrent reads and writes
    //    continue. PG12+ uses this validated CHECK to skip the full table
    //    scan that SET NOT NULL would otherwise require.
    const existingCheck = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass`,
        [checkName, table],
    );
    if ((existingCheck.rowCount ?? 0) === 0) {
        await knex.raw(
            `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IS NOT NULL) NOT VALID`,
            [table, checkName, column],
        );
    }
    // eslint-disable-next-line no-console
    console.log(`  ${table}: validating not-null constraint`);
    await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [table, checkName]);

    // 5. SET NOT NULL — fast on PG12+ thanks to the validated CHECK above.
    // eslint-disable-next-line no-console
    console.log(`  ${table}: setting NOT NULL`);
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN ?? SET NOT NULL`, [
        table,
        column,
    ]);

    // 6. The CHECK is now redundant with the column-level NOT NULL.
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        table,
        checkName,
    ]);

    // 7. Build the unique index without blocking writes. If a previous run
    //    crashed mid-build, PG may have left an INVALID index behind —
    //    `IF NOT EXISTS` matches by name only, so drop it first if present.
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_class c
         JOIN pg_index i ON i.indexrelid = c.oid
         WHERE c.relname = ? AND NOT i.indisvalid`,
        [pkName],
    );
    if ((invalidIndex.rowCount ?? 0) > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [pkName]);
    }
    // eslint-disable-next-line no-console
    console.log(`  ${table}: building unique index (concurrently)`);
    await knex.raw(
        `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (??)`,
        [pkName, table, column],
    );

    // 8. Promote the existing unique index to PRIMARY KEY. This briefly
    //    takes ACCESS EXCLUSIVE but does no scanning and finishes in ms.
    const existingPk = await knex.raw<{ rowCount: number }>(
        `SELECT 1 FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass AND contype = 'p'`,
        [pkName, table],
    );
    if ((existingPk.rowCount ?? 0) === 0) {
        // eslint-disable-next-line no-console
        console.log(`  ${table}: promoting index to primary key`);
        await knex.raw(
            `ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY USING INDEX ??`,
            [table, pkName, pkName],
        );
    }
}

export async function up(knex: Knex): Promise<void> {
    // The batched backfill below can run for many minutes on large tables.
    // Disable statement_timeout for this session so a configured timeout
    // can't interrupt the loop and leave the migration lock held.
    await knex.raw(`SET statement_timeout = 0`);
    try {
        for (const { table, column } of TABLES) {
            // eslint-disable-next-line no-console
            console.log(`Adding primary key ${column} to ${table}`);
            // eslint-disable-next-line no-await-in-loop
            await addPrimaryKey(knex, table, column);
        }
    } finally {
        await knex.raw(`RESET statement_timeout`);
    }
}

export async function down(knex: Knex): Promise<void> {
    for (const { table, column } of TABLES) {
        const pkName = `${table}_pkey`;
        const checkName = `${column}_not_null`;
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
            table,
            pkName,
        ]);
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
            table,
            checkName,
        ]);
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(`ALTER TABLE ?? DROP COLUMN IF EXISTS ??`, [
            table,
            column,
        ]);
    }
}
