import { Knex } from 'knex';

type ToolCallRow = { tool_name: string };

const OLD_NAME = 'proposeWriteback';
const NEW_NAME = 'editDbtProject';

export async function up(knex: Knex): Promise<void> {
    await knex<ToolCallRow>('ai_agent_tool_call')
        .where('tool_name', OLD_NAME)
        .update({ tool_name: NEW_NAME });
}

export async function down(knex: Knex): Promise<void> {
    await knex<ToolCallRow>('ai_agent_tool_call')
        .where('tool_name', NEW_NAME)
        .update({ tool_name: OLD_NAME });
}
