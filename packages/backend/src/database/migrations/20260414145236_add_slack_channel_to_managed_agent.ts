import { type Knex } from 'knex';

const ManagedAgentSettingsTableName = 'managed_agent_settings';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.text('slack_channel_id').nullable();
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable(ManagedAgentSettingsTableName, (table) => {
        table.dropColumn('slack_channel_id');
    });
};
