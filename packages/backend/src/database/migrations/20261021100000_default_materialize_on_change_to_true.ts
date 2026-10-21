import { type Knex } from 'knex';

const PRE_AGGREGATE_DEFINITIONS_TABLE = 'pre_aggregate_definitions';
const COLUMN = 'materialize_on_change';

export const classification = {
    kind: 'safe',
    reason: 'Changes only the column default (metadata-only); every compile writes the value explicitly and the previous release keeps reading the column as before.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT true`, [
        PRE_AGGREGATE_DEFINITIONS_TABLE,
        COLUMN,
    ]);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT false`, [
        PRE_AGGREGATE_DEFINITIONS_TABLE,
        COLUMN,
    ]);
}
