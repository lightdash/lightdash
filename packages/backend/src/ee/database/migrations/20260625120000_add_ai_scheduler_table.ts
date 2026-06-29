import { Knex } from 'knex';

const AI_SCHEDULER_TABLE = 'ai_scheduler';
const SCHEDULER_TABLE = 'scheduler';
const AI_AGENT_TABLE = 'ai_agent';
const AI_THREAD_TABLE = 'ai_thread';

// 1:1 EE satellite of the OSS scheduler table — keeps the core table AI-free and
// lets every reference be a real FK (no row = plain delivery).
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AI_SCHEDULER_TABLE, (table) => {
        table
            .uuid('scheduler_uuid')
            .primary()
            .references('scheduler_uuid')
            .inTable(SCHEDULER_TABLE)
            .onDelete('CASCADE');
        table.text('type').notNullable().checkIn(['agent', 'resource']);
        // Null for 'resource' deliveries, which run on a fast model with no agent.
        table
            .uuid('agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable(AI_AGENT_TABLE)
            .onDelete('CASCADE')
            .index();
        table.check(`(type = 'agent') = (agent_uuid IS NOT NULL)`);
        table.text('prompt').notNullable();
        table
            .uuid('source_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable(AI_THREAD_TABLE)
            .onDelete('SET NULL')
            .index();
        table.boolean('include_source_thread').notNullable().defaultTo(true);
        table.boolean('include_run_history').notNullable().defaultTo(false);
        // Thread an agent delivery builds on across runs for "include run history".
        table
            .uuid('report_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable(AI_THREAD_TABLE)
            .onDelete('SET NULL')
            .index();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_SCHEDULER_TABLE);
}
