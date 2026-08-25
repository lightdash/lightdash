import { Knex } from 'knex';

const tableName = 'linear_app_installations';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder
                .uuid('linear_app_installation_uuid')
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .primary();
            tableBuilder
                .uuid('organization_uuid')
                .unique()
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            tableBuilder.binary('encrypted_installation_id').notNullable();
            tableBuilder.binary('encrypted_access_token').notNullable();
            tableBuilder.binary('encrypted_refresh_token').nullable();
            tableBuilder.string('linear_organization_name').notNullable();
            tableBuilder.string('linear_organization_url_key').notNullable();
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            tableBuilder
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .uuid('updated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.dropTableIfExists(tableName);
}
