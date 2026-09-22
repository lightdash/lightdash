import { Knex } from 'knex';

const tableName = 'data_app_analyses';
const indexName = 'data_app_analyses_created_at_idx';

export const classification = {
    kind: 'safe',
    reason: 'Builds an index concurrently on data_app_analyses(created_at) for the retention sweep; no lock, idempotent.',
} as const;

// CREATE/DROP INDEX CONCURRENTLY can't run inside a transaction or a DO
// block, so every step is a separate statement and idempotent for retries.
export const config = { transaction: false };

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

// A concurrent build that was interrupted leaves an invalid index that
// IF NOT EXISTS would keep; drop it so the retry rebuilds a usable one.
async function dropInvalidIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [indexName, tableName],
    );
    if (getRowCount(invalidIndex) > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [indexName]);
    }
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await dropInvalidIndex(knex);
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (??)`,
            [indexName, tableName, 'created_at'],
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [indexName]);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
