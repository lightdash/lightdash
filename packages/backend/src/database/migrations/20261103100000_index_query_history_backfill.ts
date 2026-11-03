import type { Knex } from 'knex';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds a concurrent organization-scoped query history pagination index without changing existing rows or queries',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw("SET lock_timeout = '5s'");
        const invalidIndex = await knex.raw(
            `SELECT 1 FROM pg_index
             WHERE indexrelid = to_regclass('query_history_org_created_at_query_uuid_idx')
               AND indrelid = 'query_history'::regclass
               AND NOT indisvalid`,
        );
        if (invalidIndex.rows.length > 0) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS query_history_org_created_at_query_uuid_idx',
            );
        }
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS query_history_org_created_at_query_uuid_idx
             ON query_history (organization_uuid, created_at, query_uuid)`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS query_history_org_created_at_query_uuid_idx',
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
