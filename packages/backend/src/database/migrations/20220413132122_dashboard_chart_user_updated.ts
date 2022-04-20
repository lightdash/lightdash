import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_queries_versions', (tableBuilder) => {
        tableBuilder
            .uuid('updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
    });

    await knex.schema.alterTable('dashboard_versions', (tableBuilder) => {
        tableBuilder
            .uuid('updated_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('saved_queries_versions', (tableBuilder) => {
        tableBuilder.dropColumn('updated_by_user_uuid');
    });

    await knex.schema.alterTable('dashboard_versions', (tableBuilder) => {
        tableBuilder.dropColumn('updated_by_user_uuid');
    });
}
