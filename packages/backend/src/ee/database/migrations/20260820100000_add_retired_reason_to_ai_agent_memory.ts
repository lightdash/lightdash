import { Knex } from 'knex';

const AiAgentMemoryTableName = 'ai_agent_memory';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentMemoryTableName, (table) => {
        table.text('retired_reason').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentMemoryTableName, (table) => {
        table.dropColumn('retired_reason');
    });
}
