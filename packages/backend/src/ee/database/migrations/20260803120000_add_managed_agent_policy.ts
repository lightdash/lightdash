import { Knex } from 'knex';

const ManagedAgentSettingsTableName = 'managed_agent_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.jsonb('policy').notNullable().defaultTo('{}');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.dropColumn('policy');
    });
}
