import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds a secondary index on analytics_dashboard_views concurrently; no lock that blocks reads or writes, no table rewrite, and older app versions keep working.',
};

const TableName = 'analytics_dashboard_views';
const IndexName = 'analytics_dashboard_views_user_uuid_timestamp_index';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        const invalidIndex = await knex.raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_class
             JOIN pg_index ON pg_index.indexrelid = pg_class.oid
             WHERE pg_class.relname = ?
               AND pg_index.indrelid = ?::regclass
               AND NOT pg_index.indisvalid`,
            [IndexName, TableName],
        );
        if ((invalidIndex.rowCount ?? 0) > 0) {
            await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`);
        }
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${IndexName}
             ON ${TableName} (user_uuid, timestamp)`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${IndexName}`);
}
