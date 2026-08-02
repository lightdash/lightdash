import { Knex } from 'knex';

const tableName = 'user_oauth_grants';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('user_oauth_grant_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table.text('provider').notNullable();
        table.text('provider_subject').notNullable();
        table.text('provider_email').notNullable();
        table
            .specificType('scopes', 'text[]')
            .notNullable()
            .defaultTo(knex.raw("'{}'::text[]"));
        table.binary('encrypted_refresh_token').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['user_uuid', 'provider']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(tableName);
}
