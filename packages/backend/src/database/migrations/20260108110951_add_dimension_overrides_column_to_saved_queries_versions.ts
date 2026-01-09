import { Knex } from 'knex';

const SavedQueriesVersionsTableName = 'saved_queries_versions';
const DimensionOverridesColumnName = 'dimension_overrides';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.jsonb(DimensionOverridesColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.dropColumn(DimensionOverridesColumnName);
    });
}
