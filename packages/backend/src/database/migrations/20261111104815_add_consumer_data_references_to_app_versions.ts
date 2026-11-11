import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable app_versions.consumer_data_references column and backfills it for ready versions in bounded, idempotent batches',
} as const;

export const config = { transaction: false };

const versionsTable = 'app_versions';
const column = 'consumer_data_references';
const BACKFILL_BATCH_SIZE = 10000;

// Freezes the references each ready version has today. Re-running only fills
// rows still null, so a partial run resumes. Exported for tests.
export const backfillConsumerDataReferences = async (
    knex: Knex,
): Promise<number> => {
    let updated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await knex.raw(
            `UPDATE ${versionsTable}
             SET ${column} = data_references
             WHERE ctid IN (
                 SELECT ctid FROM ${versionsTable}
                 WHERE ${column} IS NULL
                   AND data_references IS NOT NULL
                   AND status = 'ready'
                 LIMIT ${BACKFILL_BATCH_SIZE}
             )`,
        );
        if (batch.rowCount === 0) break;
        updated += batch.rowCount;
    }
    return updated;
};

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw("SET LOCAL lock_timeout = '60s'");
        if (!(await trx.schema.hasColumn(versionsTable, column))) {
            await trx.schema.alterTable(versionsTable, (table) => {
                table.jsonb(column).nullable();
            });
        }
    });

    await knex.raw('SET statement_timeout = 0');
    try {
        console.log(`Backfilling ${versionsTable}.${column}`);
        const updated = await backfillConsumerDataReferences(knex);
        console.log(`Backfilled ${updated} app versions`);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw("SET LOCAL lock_timeout = '60s'");
        if (await trx.schema.hasColumn(versionsTable, column)) {
            await trx.schema.alterTable(versionsTable, (table) => {
                table.dropColumn(column);
            });
        }
    });
}
