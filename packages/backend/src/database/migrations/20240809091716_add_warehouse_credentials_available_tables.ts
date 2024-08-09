import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        'warehouse_credentials_available_tables',
        (table) => {
            table.string('database_name').notNullable();
            table.string('schema_name').notNullable();
            table.string('table_name').notNullable();
            table
                .integer('project_warehouse_credentials_id')
                .references('warehouse_credentials_id')
                .inTable('warehouse_credentials')
                .nullable()
                .onDelete('CASCADE');
            table.index('project_warehouse_credentials_id');
            table
                .uuid('user_warehouse_credentials_uuid')
                .references('user_warehouse_credentials_uuid')
                .inTable('user_warehouse_credentials')
                .nullable()
                .onDelete('CASCADE');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(
        'warehouse_credentials_available_tables',
    );
}
