import { Knex } from 'knex';

const PRE_AGGREGATE_MATERIALIZATIONS_TABLE = 'pre_aggregate_materializations';
const MATERIALIZATION_URI_COLUMN = 'materialization_uri';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table.text(MATERIALIZATION_URI_COLUMN).nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        PRE_AGGREGATE_MATERIALIZATIONS_TABLE,
        (table) => {
            table.dropColumn(MATERIALIZATION_URI_COLUMN);
        },
    );
}
