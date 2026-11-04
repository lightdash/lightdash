import { type Knex } from 'knex';

const ApiSourceCallsTableName = 'api_source_calls';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty api_source_calls table and its index; existing tables and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.schema.createTable(ApiSourceCallsTableName, (table) => {
            table
                .uuid('api_source_call_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('external_connection_uuid')
                .notNullable()
                .references('external_connection_uuid')
                .inTable('external_connections')
                .onDelete('CASCADE');
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table
                .uuid('user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table.text('context').notNullable();
            table.uuid('query_uuid').notNullable();
            table.text('query').notNullable();
            table.integer('row_limit').notNullable();
            table.text('outcome').notNullable();
            table.text('error_message').nullable();
            table.integer('provider_status').nullable();
            table.integer('api_calls').notNullable();
            table.integer('duration_ms').notNullable();
            table.integer('row_count').nullable();
            table.integer('column_count').nullable();
            table.boolean('truncated').nullable();
            table.integer('response_bytes').nullable();
            table
                .timestamp('created_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
        await knex.raw(
            `CREATE INDEX api_source_calls_connection_created_at_idx ON ${ApiSourceCallsTableName} (external_connection_uuid, created_at DESC)`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.schema.dropTableIfExists(ApiSourceCallsTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
