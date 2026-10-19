import { Knex } from 'knex';

const TableName = 'composer_query_nodes';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty composer_query_nodes table; existing tables and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.createTable(TableName, (table) => {
            table
                .uuid('composer_query_node_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table.text('scope_type').notNullable();
            table.uuid('scope_uuid').notNullable();
            table.text('node_id').notNullable();
            table.jsonb('definition').notNullable();
            table.text('tool_call_id').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            // Also serves scope lookups.
            table.unique(['scope_type', 'scope_uuid', 'node_id']);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(TableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
