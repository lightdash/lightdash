import { Knex } from 'knex';

const SavedQueriesVersionAdditionalMetricsTableName =
    'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            table.text('generated_by').nullable();
            table.text('base_metric_id').nullable();
            table.text('time_dimension_id').nullable();
            table.text('granularity').nullable();
            table.integer('period_offset').nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedQueriesVersionAdditionalMetricsTableName,
        (table) => {
            table.dropColumn('generated_by');
            table.dropColumn('base_metric_id');
            table.dropColumn('time_dimension_id');
            table.dropColumn('granularity');
            table.dropColumn('period_offset');
        },
    );
}
