import { Knex } from 'knex';

const CUSTOM_DIMENSIONS_TABLE_NAME = 'saved_queries_version_custom_dimensions';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CUSTOM_DIMENSIONS_TABLE_NAME))) {
        await knex.schema.createTable(
            CUSTOM_DIMENSIONS_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder.specificType(
                    'saved_queries_version_custom_dimension_id',
                    'integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
                );
                tableBuilder.text('id').notNullable();
                tableBuilder.text('name').notNullable();
                tableBuilder.text('dimension_id').notNullable();
                tableBuilder.text('table').notNullable();
                tableBuilder.integer('order').notNullable();
                tableBuilder.text('bin_type').notNullable();
                tableBuilder.integer('bin_number').nullable();
                tableBuilder
                    .integer('saved_queries_version_id')
                    .notNullable()
                    .references('saved_queries_version_id')
                    .inTable('saved_queries_versions')
                    .onDelete('CASCADE');

                tableBuilder.index([
                    'saved_queries_version_custom_dimension_id',
                ]);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CUSTOM_DIMENSIONS_TABLE_NAME);
}
