import { Knex } from 'knex';

const SavedQueriesVersionsTableName = 'saved_queries_versions';
const MetricOverridesColumnName = 'metric_overrides';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.jsonb(MetricOverridesColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.dropColumn(MetricOverridesColumnName);
    });
}
