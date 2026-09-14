import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable duckdb_execution jsonb column to query_history',
} as const;

const tableName = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.raw(
            `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS duckdb_execution JSONB NULL`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.raw(
            `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS duckdb_execution`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
