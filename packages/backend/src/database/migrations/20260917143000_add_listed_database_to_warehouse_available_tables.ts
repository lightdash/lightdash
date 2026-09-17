import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable cache scope and concurrent lookup indexes without changing existing rows or readers.',
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                'ALTER TABLE warehouse_credentials_available_tables ADD COLUMN IF NOT EXISTS listed_database text NULL',
            )
            .connection(connection);

        const invalidProjectIndex = await knex
            .raw<{ rowCount: number }>(
                `SELECT 1
                 FROM pg_class
                 JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                 WHERE pg_class.relname = 'warehouse_available_tables_project_listed_database_idx'
                   AND pg_index.indrelid = 'warehouse_credentials_available_tables'::regclass
                   AND NOT pg_index.indisvalid`,
            )
            .connection(connection);
        if ((invalidProjectIndex.rowCount ?? 0) > 0) {
            await knex
                .raw(
                    'DROP INDEX CONCURRENTLY IF EXISTS warehouse_available_tables_project_listed_database_idx',
                )
                .connection(connection);
        }

        const invalidUserIndex = await knex
            .raw<{ rowCount: number }>(
                `SELECT 1
                 FROM pg_class
                 JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                 WHERE pg_class.relname = 'warehouse_available_tables_user_listed_database_idx'
                   AND pg_index.indrelid = 'warehouse_credentials_available_tables'::regclass
                   AND NOT pg_index.indisvalid`,
            )
            .connection(connection);
        if ((invalidUserIndex.rowCount ?? 0) > 0) {
            await knex
                .raw(
                    'DROP INDEX CONCURRENTLY IF EXISTS warehouse_available_tables_user_listed_database_idx',
                )
                .connection(connection);
        }

        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS warehouse_available_tables_project_listed_database_idx
                 ON warehouse_credentials_available_tables (project_warehouse_credentials_id, listed_database)`,
            )
            .connection(connection);
        await knex
            .raw(
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS warehouse_available_tables_user_listed_database_idx
                 ON warehouse_credentials_available_tables (user_warehouse_credentials_uuid, listed_database)`,
            )
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
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS warehouse_available_tables_project_listed_database_idx',
            )
            .connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS warehouse_available_tables_user_listed_database_idx',
            )
            .connection(connection);
        await knex
            .raw(
                'ALTER TABLE warehouse_credentials_available_tables DROP COLUMN IF EXISTS listed_database',
            )
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
