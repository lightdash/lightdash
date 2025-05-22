import { Knex } from 'knex';

const AiAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AiAgentTableName, 'updated_at')) return;
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AiAgentTableName, 'updated_at'))) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropColumn('updated_at');
    });
}
