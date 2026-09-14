import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds a secondary recency index concurrently without rewriting view events or blocking normal reads and writes; older app versions remain compatible.',
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_dashboard_views_dashboard_uuid_timestamp_index
                  ON analytics_dashboard_views (dashboard_uuid, timestamp DESC)`)
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS analytics_dashboard_views_dashboard_uuid_timestamp_index',
            )
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
