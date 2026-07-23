import { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table
            .boolean('require_explicit_slack_channel_linking')
            .notNullable()
            .defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.dropColumn('require_explicit_slack_channel_linking');
    });
}
