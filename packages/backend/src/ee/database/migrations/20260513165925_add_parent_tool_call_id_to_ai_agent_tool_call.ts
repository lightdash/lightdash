import { Knex } from 'knex';

const AiAgentToolCallTableName = 'ai_agent_tool_call';
const ColumnName = 'parent_tool_call_id';
// Composite so children-of-this-call lookups prune by prompt first;
// tool_call_id is not unique across prompts (retries can recycle it).
const IndexName = 'ai_agent_tool_call_prompt_uuid_parent_tool_call_id_idx';
const CheckConstraintName =
    'ai_agent_tool_call_parent_tool_call_id_length_check';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentToolCallTableName, (table) => {
        table.text(ColumnName).nullable();
        table.index(['ai_prompt_uuid', ColumnName], IndexName);
        table.check('length(??) <= 128', [ColumnName], CheckConstraintName);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentToolCallTableName, (table) => {
        table.dropChecks(CheckConstraintName);
        table.dropIndex(['ai_prompt_uuid', ColumnName], IndexName);
        table.dropColumn(ColumnName);
    });
}
