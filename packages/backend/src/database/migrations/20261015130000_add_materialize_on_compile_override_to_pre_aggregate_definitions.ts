import { type Knex } from 'knex';

const PRE_AGGREGATE_DEFINITIONS_TABLE = 'pre_aggregate_definitions';
const COLUMN = 'materialize_on_compile_override';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable boolean column with no default or backfill; the previous release ignores it and keeps reading the YAML-derived column.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table.boolean(COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table.dropColumn(COLUMN);
    });
}
