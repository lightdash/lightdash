import { Knex } from 'knex';

const AIAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AIAgentTableName))) return;

    await knex.schema.alterTable(AIAgentTableName, (table) => {
        table.boolean('enable_self_improvement').defaultTo(false).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AIAgentTableName))) return;

    await knex.schema.alterTable(AIAgentTableName, (table) => {
        table.dropColumn('enable_self_improvement');
    });
}
