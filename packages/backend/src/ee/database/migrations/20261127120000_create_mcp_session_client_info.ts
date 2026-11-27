import { Knex } from 'knex';

const TableName = 'mcp_session_client_info';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table. The previous release keeps reading and writing mcp_client_info, which this migration leaves untouched.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    // One row per initialize: the clientInfo a session declared, keyed by
    // the session id the server minted for it
    await knex.schema.createTable(TableName, (table) => {
        table.uuid('mcp_session_id').primary();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table.text('client_name').notNullable();
        table.text('client_version').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now())
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.dropTableIfExists(TableName);
}
