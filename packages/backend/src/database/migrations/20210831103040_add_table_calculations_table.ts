import { Knex } from 'knex';

const TABLE_CALCULATIONS_TABLE_NAME =
    'saved_queries_version_table_calculations';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(TABLE_CALCULATIONS_TABLE_NAME))) {
        await knex.schema.createTable(
            TABLE_CALCULATIONS_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder.specificType(
                    'saved_queries_version_table_calculation_id',
                    'integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY',
                );
                tableBuilder.text('name').notNullable();
                tableBuilder.text('display_name').notNullable();
                tableBuilder.integer('order').notNullable();
                tableBuilder.text('calculation_raw_sql').notNullable();
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
    await knex.schema.dropTableIfExists(TABLE_CALCULATIONS_TABLE_NAME);
}
