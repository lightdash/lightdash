import { Knex } from 'knex';

const aiEvalTable = 'ai_eval';
const aiEvalPromptTable = 'ai_eval_prompt';
const aiEvalRunTable = 'ai_eval_run';
const aiEvalRunResultTable = 'ai_eval_run_result';
const aiAgentTable = 'ai_agent';
const aiThreadTable = 'ai_thread';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(aiEvalTable, (table) => {
        table
            .uuid('ai_eval_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('created_by_user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('agent_uuid')
            .notNullable()
            .references('ai_agent_uuid')
            .inTable(aiAgentTable)
            .onDelete('CASCADE');
        table.string('title').notNullable();
        table.text('description');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['created_by_user_uuid']);
        table.index(['agent_uuid']);
    });

    await knex.schema.createTable(aiEvalPromptTable, (table) => {
        table
            .uuid('ai_eval_prompt_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_eval_uuid')
            .notNullable()
            .references('ai_eval_uuid')
            .inTable(aiEvalTable)
            .onDelete('CASCADE');
        table
            .uuid('ai_prompt_uuid')
            .nullable()
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');
        table
            .uuid('ai_thread_uuid')
            .nullable()
            .references('ai_thread_uuid')
            .inTable(aiThreadTable)
            .onDelete('CASCADE');
        table.text('prompt').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['ai_eval_uuid']);
        table.index(['ai_prompt_uuid']);
        table.index(['ai_thread_uuid']);
    });

    await knex.schema.createTable(aiEvalRunTable, (table) => {
        table
            .uuid('ai_eval_run_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_eval_uuid')
            .notNullable()
            .references('ai_eval_uuid')
            .inTable(aiEvalTable)
            .onDelete('CASCADE');
        table
            .enum('status', ['pending', 'running', 'completed', 'failed'])
            .notNullable()
            .defaultTo('pending');
        table.timestamp('completed_at', { useTz: false });
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['ai_eval_uuid']);
        table.index(['status']);
    });

    await knex.schema.createTable(aiEvalRunResultTable, (table) => {
        table
            .uuid('ai_eval_run_result_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_eval_run_uuid')
            .notNullable()
            .references('ai_eval_run_uuid')
            .inTable(aiEvalRunTable)
            .onDelete('CASCADE');
        table
            .uuid('ai_eval_prompt_uuid')
            .references('ai_eval_prompt_uuid')
            .inTable(aiEvalPromptTable)
            .onDelete('SET NULL');
        table
            .uuid('ai_thread_uuid')
            .references('ai_thread_uuid')
            .inTable(aiThreadTable)
            .onDelete('CASCADE');
        table
            .enum('status', ['pending', 'running', 'completed', 'failed'])
            .notNullable()
            .defaultTo('pending');
        table.text('error_message');
        table.timestamp('completed_at', { useTz: false });
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['ai_eval_run_uuid']);
        table.index(['ai_eval_prompt_uuid']);
        table.index(['ai_thread_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(aiEvalRunResultTable);
    await knex.schema.dropTableIfExists(aiEvalRunTable);
    await knex.schema.dropTableIfExists(aiEvalPromptTable);
    await knex.schema.dropTableIfExists(aiEvalTable);
}
