import { Knex } from 'knex';

const ADDITIONAL_METRICS_TABLE_NAME =
    'saved_queries_version_additional_metrics';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ADDITIONAL_METRICS_TABLE_NAME))) {
        await knex.schema.createTable(
            ADDITIONAL_METRICS_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder.specificType(
                    'saved_queries_version_additional_metric_id',
                    'integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
                );
                tableBuilder.text('field_type').notNullable();
                tableBuilder.text('type').notNullable();
                tableBuilder.boolean('is_auto_generated').notNullable();
                tableBuilder
                    .integer('saved_queries_version_id')
                    .notNullable()
                    .references('saved_queries_version_id')
                    .inTable('saved_queries_versions')
                    .onDelete('CASCADE');
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ADDITIONAL_METRICS_TABLE_NAME);
}
