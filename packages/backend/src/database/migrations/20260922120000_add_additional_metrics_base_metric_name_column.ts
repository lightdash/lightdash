import { Knex } from 'knex';

const AdditionalMetricsTableName = 'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AdditionalMetricsTableName, (table) => {
        table.text('base_metric_name').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            AdditionalMetricsTableName,
            'base_metric_name',
        )
    ) {
        await knex.schema.alterTable(AdditionalMetricsTableName, (table) => {
            table.dropColumn('base_metric_name');
        });
    }
}
