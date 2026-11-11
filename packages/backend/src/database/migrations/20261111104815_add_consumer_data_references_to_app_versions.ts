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
    connection?: unknown,
): Promise<number> => {
    const run = (sql: string) => {
        const query = knex.raw(sql);
        return connection ? query.connection(connection) : query;
    };
    let updated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await run(
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

// Session settings apply to one connection, so the backfill is pinned to the
// connection that disabled the timeout, and the previous value is restored.
const withoutStatementTimeout = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        const previous = await knex
            .raw(`SELECT current_setting('statement_timeout') AS value`)
            .connection(connection);
        const previousValue: string = previous.rows[0].value;
        try {
            await knex.raw('SET statement_timeout = 0').connection(connection);
            await run(connection);
        } finally {
            await knex
                .raw(`SELECT set_config('statement_timeout', ?, false)`, [
                    previousValue,
                ])
                .connection(connection);
        }
    } finally {
        await knex.client.releaseConnection(connection);
    }
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

    await withoutStatementTimeout(knex, async (connection) => {
        console.log(`Backfilling ${versionsTable}.${column}`);
        const updated = await backfillConsumerDataReferences(knex, connection);
        console.log(`Backfilled ${updated} app versions`);
    });
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
