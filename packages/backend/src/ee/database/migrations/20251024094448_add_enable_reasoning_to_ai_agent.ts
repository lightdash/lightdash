import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.boolean('enable_reasoning').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.dropColumn('enable_reasoning');
    });
}
