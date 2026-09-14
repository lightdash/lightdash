import { Knex } from 'knex';

const AiAgentMemoryConsolidationRunTableName =
    'ai_agent_memory_consolidation_run';

export async function up(knex: Knex): Promise<void> {
    // Mode, not outcome: a dry run applied nothing whatever its status, so its
    // operation columns hold proposals and never count as curation.
    await knex.schema.alterTable(
        AiAgentMemoryConsolidationRunTableName,
        (table) => {
            table.boolean('dry_run').notNullable().defaultTo(false);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(
        AiAgentMemoryConsolidationRunTableName,
        (table) => {
            table.dropColumn('dry_run');
        },
    );
}
