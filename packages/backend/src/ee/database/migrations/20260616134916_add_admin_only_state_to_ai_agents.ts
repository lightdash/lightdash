import { Knex } from 'knex';

const AiAgentTableName = 'ai_agent';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.boolean('admin_only').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropColumn('admin_only');
    });
}
