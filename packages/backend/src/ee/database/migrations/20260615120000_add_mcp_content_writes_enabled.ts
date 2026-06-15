import { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table
            .boolean('mcp_content_writes_enabled')
            .notNullable()
            .defaultTo(true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(aiOrganizationSettings, (table) => {
        table.dropColumn('mcp_content_writes_enabled');
    });
}
