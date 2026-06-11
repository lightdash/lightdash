import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const AI_THREAD_TABLE_NAME = 'ai_thread';
const AI_THREAD_COMPACTION_TABLE_NAME = 'ai_thread_compaction';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AI_PROMPT_TABLE_NAME, 'token_usage'))) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.jsonb('token_usage').nullable();
        });
    }

    if (!(await knex.schema.hasTable(AI_THREAD_COMPACTION_TABLE_NAME))) {
        await knex.schema.createTable(
            AI_THREAD_COMPACTION_TABLE_NAME,
            (table) => {
                table
                    .uuid('ai_thread_compaction_uuid')
                    .notNullable()
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('ai_thread_uuid')
                    .notNullable()
                    .references('ai_thread_uuid')
                    .inTable(AI_THREAD_TABLE_NAME)
                    .onDelete('CASCADE');
                table
                    .uuid('compacted_through_ai_prompt_uuid')
                    .notNullable()
                    // Last historical prompt absorbed into the summary.
                    .references('ai_prompt_uuid')
                    .inTable(AI_PROMPT_TABLE_NAME)
                    .onDelete('CASCADE');
                table
                    .uuid('triggering_ai_prompt_uuid')
                    .notNullable()
                    // New prompt that caused compaction before its response ran.
                    .references('ai_prompt_uuid')
                    .inTable(AI_PROMPT_TABLE_NAME)
                    .onDelete('CASCADE');
                table.text('serialized_input').notNullable();
                table.text('summary').notNullable();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());

                table.index(
                    ['ai_thread_uuid'],
                    'ai_thread_compaction_thread_idx',
                );
                table.index(
                    ['compacted_through_ai_prompt_uuid'],
                    'ai_thread_compaction_through_prompt_idx',
                );
                table.unique(['triggering_ai_prompt_uuid'], {
                    indexName: 'ai_thread_compaction_triggering_prompt_unique',
                });
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_THREAD_COMPACTION_TABLE_NAME);

    if (await knex.schema.hasColumn(AI_PROMPT_TABLE_NAME, 'token_usage')) {
        await knex.schema.alterTable(AI_PROMPT_TABLE_NAME, (table) => {
            table.dropColumn('token_usage');
        });
    }
}
