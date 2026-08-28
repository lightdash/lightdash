import { Knex } from 'knex';

const AdditionalMetricsTableName = 'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(AdditionalMetricsTableName, (table) => {
        table.text('comparison_mode').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(AdditionalMetricsTableName, (table) => {
        table.dropColumn('comparison_mode');
    });
}
