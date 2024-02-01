import { Knex } from 'knex';

const customMetricsTableName = 'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(customMetricsTableName, (tableBuilder) => {
        tableBuilder.dropColumns('prefix', 'suffix', 'separator');
        tableBuilder.jsonb('format_options').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(customMetricsTableName, (tableBuilder) => {
        tableBuilder.string('prefix').nullable();
        tableBuilder.string('suffix').nullable();
        tableBuilder.string('separator').nullable();
        tableBuilder.dropColumn('format_options');
    });
}
