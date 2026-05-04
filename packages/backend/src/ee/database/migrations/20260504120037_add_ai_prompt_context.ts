import { Knex } from 'knex';

const AI_PROMPT_TABLE_NAME = 'ai_prompt';
const AI_PROMPT_CONTEXT_TABLE_NAME = 'ai_prompt_context';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AI_PROMPT_CONTEXT_TABLE_NAME))) {
        await knex.schema.createTable(AI_PROMPT_CONTEXT_TABLE_NAME, (table) => {
            table
                .uuid('ai_prompt_context_uuid')
                .notNullable()
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('ai_prompt_uuid')
                .notNullable()
                .references('ai_prompt_uuid')
                .inTable(AI_PROMPT_TABLE_NAME)
                .onDelete('CASCADE');
            table
                .text('entity_type')
                .notNullable()
                .comment('Discriminator for the pinned entity.');
            table.uuid('entity_uuid').notNullable();
            table
                .uuid('pinned_version_uuid')
                .nullable()
                .comment(
                    "Snapshot of the entity's latest version uuid at pin time",
                );
            table
                .text('display_name')
                .nullable()
                .comment("Snapshot of the entity's name at pin time.");
            table
                .jsonb('runtime_overrides')
                .nullable()
                .comment('Runtime state captured at pin time.');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());

            table.unique(['ai_prompt_uuid', 'entity_type', 'entity_uuid'], {
                indexName: 'ai_prompt_context_prompt_entity_unique',
            });
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AI_PROMPT_CONTEXT_TABLE_NAME);
}
