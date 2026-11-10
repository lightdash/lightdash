import { type Knex } from 'knex';

const PRE_AGGREGATE_DEFINITIONS_TABLE = 'pre_aggregate_definitions';
const PRE_AGGREGATE_MATERIALIZATIONS_TABLE = 'pre_aggregate_materializations';
const DEFINITION_COLUMN = 'definition_fingerprint';
const MATERIALIZATION_COLUMN = 'materialized_fingerprint';

export const classification = {
    kind: 'safe',
    reason: 'Adds two nullable text columns with no default or backfill; the previous release ignores them and keeps rebuilding every materialization on compile.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table.text(DEFINITION_COLUMN).nullable();
    });
    await knex.schema.alterTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table.text(MATERIALIZATION_COLUMN).nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table.dropColumn(MATERIALIZATION_COLUMN);
        },
    );
    await knex.schema.alterTable(PRE_AGGREGATE_DEFINITIONS_TABLE, (table) => {
        table.dropColumn(DEFINITION_COLUMN);
    });
}
