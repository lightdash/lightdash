import { Knex } from 'knex';

const ManagedAgentSettingsTableName = 'managed_agent_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.text('anthropic_vault_config_hash').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.dropColumn('anthropic_vault_config_hash');
    });
}
