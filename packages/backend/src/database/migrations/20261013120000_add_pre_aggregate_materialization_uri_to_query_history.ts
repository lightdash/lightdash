import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable pre_aggregate_materialization_uri text column to query_history',
} as const;

const tableName = 'query_history';
const columnName = 'pre_aggregate_materialization_uri';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        // The materialization a managed pre-aggregate run reads, so a worker
        // rebuilding the run from the row can lock its DuckDB session to it
        await knex.raw(
            `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} TEXT NULL`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.raw(
            `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName}`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
