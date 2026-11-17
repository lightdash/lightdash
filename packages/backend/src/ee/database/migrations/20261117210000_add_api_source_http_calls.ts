import { type Knex } from 'knex';

const ApiSourceHttpCallsTableName = 'api_source_http_calls';
const ApiSourceCallsTableName = 'api_source_calls';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty api_source_http_calls table and its index; existing tables and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.createTable(ApiSourceHttpCallsTableName, (table) => {
        table
            .uuid('api_source_http_call_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('api_source_call_uuid')
            .notNullable()
            .references('api_source_call_uuid')
            .inTable(ApiSourceCallsTableName)
            .onDelete('CASCADE');
        table.integer('sequence').notNullable();
        table.text('method').notNullable();
        table.text('path').notNullable();
        table.integer('provider_status').nullable();
        table.integer('row_count').nullable();
        table.integer('response_bytes').notNullable();
        table.integer('duration_ms').notNullable();
        table.text('error_message').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['api_source_call_uuid', 'sequence']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.schema.dropTableIfExists(ApiSourceHttpCallsTableName);
}
