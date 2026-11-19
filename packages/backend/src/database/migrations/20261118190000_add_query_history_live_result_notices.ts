import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable query history column without a default or table rewrite; existing readers and writers remain compatible.',
} as const;

const TableName = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(TableName, (table) => {
        table.jsonb('live_result_notices').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(TableName, (table) => {
        table.dropColumn('live_result_notices');
    });
}
