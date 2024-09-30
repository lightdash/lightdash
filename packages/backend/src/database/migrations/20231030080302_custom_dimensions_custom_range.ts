import { Knex } from 'knex';

const CUSTOM_DIMENSIONS_TABLE_NAME = 'saved_queries_version_custom_dimensions';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(CUSTOM_DIMENSIONS_TABLE_NAME)) {
        await knex.schema.alterTable(CUSTOM_DIMENSIONS_TABLE_NAME, (table) => {
            table.jsonb('custom_range').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            CUSTOM_DIMENSIONS_TABLE_NAME,
            'custom_range',
        )
    ) {
        await knex.schema.alterTable(CUSTOM_DIMENSIONS_TABLE_NAME, (t) => {
            t.dropColumns('custom_range');
        });
    }
}
