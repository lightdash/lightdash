import { Knex } from 'knex';

const AiAgentMemoryTableName = 'ai_agent_memory';

// Advisory promotion-nomination label, enforced as a TS union only — matching
// the `status` column precedent. A constant default keeps this metadata-only
// on PG11+, so existing rows backfill to 'user' without a table rewrite.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentMemoryTableName, (table) => {
        table.text('scope').notNullable().defaultTo('user');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentMemoryTableName, (table) => {
        table.dropColumn('scope');
    });
}
