import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('ai_thread', 'agent_uuid')) return;

    await knex.schema.alterTable('ai_thread', (table) => {
        table
            .uuid('agent_uuid')
            .nullable()
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn('ai_thread', 'agent_uuid'))) return;

    await knex.schema.alterTable('ai_thread', (table) => {
        table.dropForeign(['agent_uuid']);
        table.dropColumn('agent_uuid');
    });
}
