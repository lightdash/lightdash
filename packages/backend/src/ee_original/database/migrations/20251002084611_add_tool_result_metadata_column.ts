import { Knex } from 'knex';

const AiAgentToolResultTableName = 'ai_agent_tool_result';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentToolResultTableName))) return;

    await knex.schema.alterTable(AiAgentToolResultTableName, (table) => {
        table.jsonb('metadata').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentToolResultTableName))) return;

    await knex.schema.alterTable(AiAgentToolResultTableName, (table) => {
        table.dropColumn('metadata');
    });
}
