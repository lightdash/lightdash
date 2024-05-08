import { Knex } from 'knex';

const CUSTOM_SQL_DIMENSIONS_TABLE_NAME =
    'saved_queries_version_custom_sql_dimensions';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CUSTOM_SQL_DIMENSIONS_TABLE_NAME))) {
        await knex.schema.createTable(
            CUSTOM_SQL_DIMENSIONS_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('saved_queries_version_custom_sql_dimensions_uuid')
                    .primary()
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
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
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CUSTOM_SQL_DIMENSIONS_TABLE_NAME);
}
