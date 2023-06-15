import { Knex } from 'knex';

const SavedChartAdditionalMetricsTableName =
    'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedChartAdditionalMetricsTableName,
        (tableBuilder) => {
            tableBuilder.text('filters').nullable();
            tableBuilder.string('base_dimension_name').nullable();
            tableBuilder.string('id').nullable();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        SavedChartAdditionalMetricsTableName,
        (tableBuilder) => {
            tableBuilder.dropColumns('filters', 'base_dimension_name', 'id');
        },
    );
}
