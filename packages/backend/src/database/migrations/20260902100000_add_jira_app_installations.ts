import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty Jira installation table without reading or rewriting existing rows',
} as const;

const tableName = 'jira_app_installations';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    if (!(await knex.schema.hasTable(tableName))) {
        await knex.schema.createTable(tableName, (table) => {
            table
                .uuid('jira_app_installation_uuid')
                .defaultTo(knex.raw('uuid_generate_v4()'))
                .primary();
            table
                .uuid('organization_uuid')
                .unique()
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE')
                .index();
            table.string('oauth_client_id').notNullable();
            table.binary('encrypted_oauth_client_secret').notNullable();
            table.binary('encrypted_access_token').notNullable();
            table.binary('encrypted_refresh_token').nullable();
            table.timestamp('token_expires_at', { useTz: false }).notNullable();
            table.string('jira_site_id').nullable();
            table.string('jira_site_name').nullable();
            table.string('jira_site_url').nullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
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
