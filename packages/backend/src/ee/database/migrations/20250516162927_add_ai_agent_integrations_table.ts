import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable('ai_agent_integration')) return;
    await knex.schema.createTable('ai_agent_integration', (table) => {
        table
            .uuid('ai_agent_integration_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_agent_uuid')
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('CASCADE');
        table.enum('integration_type', ['slack']).notNullable();
        table.jsonb('configuration').notNullable(); // {slackChannelId: string}
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('ai_agent_integration'))) return;
    await knex.schema.dropTableIfExists('ai_agent_integration');
}
