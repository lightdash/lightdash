import { Knex } from 'knex';

const AiAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentTableName))) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.boolean('enable_sql_mode').defaultTo(true).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AiAgentTableName))) return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropColumn('enable_sql_mode');
    });
}
