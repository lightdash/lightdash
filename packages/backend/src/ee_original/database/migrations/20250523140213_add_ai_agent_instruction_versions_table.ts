import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('ai_agent_instruction_versions'))) {
        await knex.schema.createTable(
            'ai_agent_instruction_versions',
            (table) => {
                table
                    .uuid('ai_agent_instruction_version_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('ai_agent_uuid')
                    .references('ai_agent_uuid')
                    .inTable('ai_agent')
                    .onDelete('CASCADE')
                    .notNullable();
                table.text('instruction').notNullable();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());

                table.index(['ai_agent_uuid', 'created_at']);
                table.index('ai_agent_uuid');
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('ai_agent_instruction_versions');
}
