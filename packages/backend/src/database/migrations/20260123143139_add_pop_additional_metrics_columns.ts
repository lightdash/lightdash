import { Knex } from 'knex';

const SavedQueriesVersionAdditionalMetricsTableName =
    'saved_queries_version_additional_metrics';
const SavedQueriesVersionsTableName = 'saved_queries_versions';

export async function up(knex: Knex): Promise<void> {
    // Add PoP metadata columns to additional metrics
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            table.text('generation_type').nullable();
            table.text('base_metric_id').nullable();
            table.text('time_dimension_id').nullable();
            table.text('granularity').nullable();
            table.integer('period_offset').nullable();
        },
    );

    // Drop deprecated period_over_period_config column from saved_queries_versions
    // PoP is now stored as explicit additional metrics
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.dropColumn('period_over_period_config');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Re-add period_over_period_config column
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.jsonb('period_over_period_config').nullable();
    });

    // Drop PoP metadata columns from additional metrics
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            table.dropColumn('generation_type');
            table.dropColumn('base_metric_id');
            table.dropColumn('time_dimension_id');
            table.dropColumn('granularity');
            table.dropColumn('period_offset');
        },
    );
}
