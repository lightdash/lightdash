import { type Knex } from 'knex';

const SavedChartVersionsTableName = 'saved_queries_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedChartVersionsTableName, (table) => {
        table.jsonb('drill_config').nullable().defaultTo(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(SavedChartVersionsTableName, 'drill_config')
    ) {
        await knex.schema.alterTable(SavedChartVersionsTableName, (table) => {
            table.dropColumn('drill_config');
        });
    }
}
