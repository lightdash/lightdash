import { Knex } from 'knex';

const ManagedAgentSettingsTableName = 'managed_agent_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.text('anthropic_agent_id').nullable();
        table.text('anthropic_agent_config_hash').nullable();
        table.integer('anthropic_agent_version').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.dropColumn('anthropic_agent_version');
        table.dropColumn('anthropic_agent_config_hash');
        table.dropColumn('anthropic_agent_id');
    });
}
