import { Knex } from 'knex';

const turnSignalTable = 'ai_agent_review_turn_signal';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(turnSignalTable, (table) => {
        // Structured project_context entry the judge emits for project_context
        // findings; consumed by the project_context writeback strategy.
        table.jsonb('project_context_entry').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(turnSignalTable, (table) => {
        table.dropColumn('project_context_entry');
    });
}
