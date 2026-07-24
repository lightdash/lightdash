import { Knex } from 'knex';

const AiAgentMemoryTableName = 'ai_agent_memory';
const AiAgentThreadDistillTableName = 'ai_agent_thread_distill';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(AiAgentThreadDistillTableName, (table) => {
        table
            .uuid('ai_agent_thread_distill_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('CASCADE')
            .unique();
        table.text('outcome').notNullable();
        table.text('no_op_reason').nullable();
        table.text('error_message').nullable();
        table.text('distill_prompt_hash').nullable();
        table.timestamp('distilled_up_to', { useTz: false }).notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.schema.createTable(AiAgentMemoryTableName, (table) => {
        table
            .uuid('ai_agent_memory_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('SET NULL')
            .index();
        table
            .uuid('user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .uuid('source_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('SET NULL')
            .index();
        table.text('slug').notNullable();
        table.text('title').notNullable();
        table.text('raw_memory').notNullable();
        table.text('thread_summary').nullable();
        table.jsonb('terms').notNullable().defaultTo('[]');
        table.jsonb('objects').notNullable().defaultTo('[]');
        table.jsonb('unresolved_objects').notNullable().defaultTo('[]');
        table.text('status').notNullable().defaultTo('active');
        table
            .uuid('superseded_by_uuid')
            .nullable()
            .references('ai_agent_memory_uuid')
            .inTable(AiAgentMemoryTableName)
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('generated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.integer('cited_count').notNullable().defaultTo(0);
        table.timestamp('last_cited_at', { useTz: false }).nullable();
        table.integer('pulled_count').notNullable().defaultTo(0);
        table.timestamp('last_pulled_at', { useTz: false }).nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'slug']);
    });
    await knex.raw(`
        CREATE UNIQUE INDEX ai_agent_memory_one_active_per_thread
        ON ${AiAgentMemoryTableName} (source_thread_uuid)
        WHERE status = 'active' AND source_thread_uuid IS NOT NULL
    `);
    await knex.raw(`
        CREATE INDEX ai_agent_memory_injection_ranking
        ON ${AiAgentMemoryTableName} (project_uuid, last_cited_at DESC NULLS LAST, generated_at DESC)
        WHERE status = 'active'
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiAgentMemoryTableName);
    await knex.schema.dropTableIfExists(AiAgentThreadDistillTableName);
}
