import { Knex } from 'knex';

const AiFrontendToolExecutionTableName = 'ai_frontend_tool_execution';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiFrontendToolExecutionTableName, (table) => {
        table.text('tool_call_id').primary();
        table.uuid('ai_prompt_uuid').notNullable();
        table.uuid('ai_thread_uuid').notNullable();
        table.text('tool_name').notNullable();
        table.text('action').notNullable();
        table.jsonb('payload').nullable();
        table.text('status').notNullable().defaultTo('pending');
        table.text('result').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('resolved_at', { useTz: true }).nullable();

        table
            .foreign('ai_prompt_uuid')
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');
        table
            .foreign('ai_thread_uuid')
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('CASCADE');

        table.index(
            ['ai_thread_uuid', 'status'],
            'ai_frontend_tool_execution_thread_status_idx',
        );
        table.index('created_at', 'ai_frontend_tool_execution_created_at_idx');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiFrontendToolExecutionTableName);
}
