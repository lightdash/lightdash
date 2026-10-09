import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds an organization OAuth client table without changing existing data or columns.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(
        'organization_snowflake_agent_clients',
        (table) => {
            table
                .uuid('organization_snowflake_agent_client_uuid')
                .primary()
                .defaultTo(knex.raw('gen_random_uuid()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .unique()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.text('account_url').notNullable();
            table.text('account_identifier').notNullable();
            table.text('client_id').notNullable();
            table.binary('encrypted_client_secret').notNullable();
            table
                .uuid('client_version')
                .notNullable()
                .defaultTo(knex.raw('gen_random_uuid()'));
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: true })
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
                .uuid('updated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('organization_snowflake_agent_clients');
}
