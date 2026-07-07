import { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.binary('encrypted_provider_api_keys').nullable();
        table.jsonb('provider_api_key_hints').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.dropColumn('encrypted_provider_api_keys');
        table.dropColumn('provider_api_key_hints');
    });
}
