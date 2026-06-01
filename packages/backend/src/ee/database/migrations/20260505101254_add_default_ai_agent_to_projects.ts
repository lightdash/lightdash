import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const AI_AGENT_TABLE = 'ai_agent';
const DEFAULT_AI_AGENT_COLUMN = 'default_ai_agent_uuid';

export async function up(knex: Knex): Promise<void> {
    // Add default_ai_agent_uuid column to projects table
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table
            .uuid(DEFAULT_AI_AGENT_COLUMN)
            .nullable()
            .references('ai_agent_uuid')
            .inTable(AI_AGENT_TABLE)
            .onDelete('SET NULL');

        table.index(DEFAULT_AI_AGENT_COLUMN);
    });
}

export async function down(knex: Knex): Promise<void> {
    // Remove the default_ai_agent_uuid column
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.dropIndex(DEFAULT_AI_AGENT_COLUMN);
        table.dropColumn(DEFAULT_AI_AGENT_COLUMN);
    });
}
