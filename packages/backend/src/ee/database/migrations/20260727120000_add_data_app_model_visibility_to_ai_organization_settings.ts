import { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.jsonb('data_app_model_visibility').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.dropColumn('data_app_model_visibility');
    });
}
