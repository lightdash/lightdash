import { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table
            .boolean('ai_agent_reviews_enabled')
            .notNullable()
            .defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.dropColumn('ai_agent_reviews_enabled');
    });
}
