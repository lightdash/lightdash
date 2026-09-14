import { Knex } from 'knex';

const TABLE_NAME = 'managed_agent_settings';

// Merge only after a released version stops using these columns and hosted
// credentials/resources have been retired. The down migration recreates empty
// columns; it cannot recover the deleted credentials or resource identifiers.
const DROPPED_COLUMNS = [
    'service_account_token',
    'anthropic_agent_id',
    'anthropic_agent_config_hash',
    'anthropic_agent_version',
    'anthropic_environment_id',
    'anthropic_vault_id',
    'anthropic_vault_config_hash',
];

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumns(...DROPPED_COLUMNS);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.binary('service_account_token').nullable();
        table.text('anthropic_agent_id').nullable();
        table.text('anthropic_agent_config_hash').nullable();
        table.integer('anthropic_agent_version').nullable();
        table.text('anthropic_environment_id').nullable();
        table.text('anthropic_vault_id').nullable();
        table.text('anthropic_vault_config_hash').nullable();
    });
}
