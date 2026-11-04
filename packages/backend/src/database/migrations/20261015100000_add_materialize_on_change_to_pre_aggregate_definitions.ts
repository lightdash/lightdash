import { type Knex } from 'knex';

const PRE_AGGREGATE_DEFINITIONS_TABLE = 'pre_aggregate_definitions';
const COLUMN = 'materialize_on_change';

export const classification = {
    kind: 'safe',
    reason: 'Adds a boolean column with a constant default (metadata-only on Postgres 11+); the previous release ignores it and keeps materializing on every compile.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table.boolean(COLUMN).notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table.dropColumn(COLUMN);
    });
}
