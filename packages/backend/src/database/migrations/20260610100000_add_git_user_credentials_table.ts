import { Knex } from 'knex';

const tableName = 'git_user_credentials';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (tableBuilder) => {
            tableBuilder
                .uuid('git_user_credential_uuid')
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .primary();
            tableBuilder
                .uuid('user_uuid')
                .notNullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('CASCADE')
                .index();
            tableBuilder
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            tableBuilder.string('provider').notNullable();
            tableBuilder.string('provider_login').notNullable();
            tableBuilder.string('provider_user_id').notNullable();
            tableBuilder.binary('encrypted_auth_token').notNullable();
            tableBuilder.binary('encrypted_refresh_token').notNullable();
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder.unique(['user_uuid', 'organization_uuid', 'provider']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
