import { Knex } from 'knex';

const UserWarehouseCredentialsTableName = 'user_warehouse_credentials';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserWarehouseCredentialsTableName, (table) => {
        table
            .uuid('project_uuid')
            .nullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(UserWarehouseCredentialsTableName, (table) => {
        table.dropColumn('project_uuid');
    });
}
