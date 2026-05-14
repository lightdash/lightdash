import { Knex } from 'knex';

const ManagedAgentSettingsTableName = 'managed_agent_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.jsonb('tool_settings').notNullable().defaultTo('{}');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.dropColumn('tool_settings');
    });
}
