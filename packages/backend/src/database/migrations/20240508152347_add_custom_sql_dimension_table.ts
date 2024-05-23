import { Knex } from 'knex';

const CUSTOM_SQL_DIMENSIONS_TABLE_NAME =
    'saved_queries_version_custom_sql_dimensions';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CUSTOM_SQL_DIMENSIONS_TABLE_NAME))) {
        await knex.schema.createTable(
            CUSTOM_SQL_DIMENSIONS_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .integer('saved_queries_version_id')
                    .notNullable()
                    .references('saved_queries_version_id')
                    .inTable('saved_queries_versions')
                    .onDelete('CASCADE');
                tableBuilder.text('id').notNullable();
                tableBuilder.text('name').notNullable();
                tableBuilder.text('table').notNullable();
                tableBuilder.text('sql').notNullable();
                tableBuilder.text('dimension_type').notNullable();
                tableBuilder.integer('order').notNullable();

                tableBuilder.unique(['id', 'saved_queries_version_id']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CUSTOM_SQL_DIMENSIONS_TABLE_NAME);
}
