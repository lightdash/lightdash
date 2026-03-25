import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('oauth2_clients', (table) => {
        table
            .uuid('organization_uuid')
            .nullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table.index('organization_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('oauth2_clients', (table) => {
        table.dropIndex('organization_uuid');
        table.dropColumn('created_by_user_uuid');
        table.dropColumn('organization_uuid');
    });
}
