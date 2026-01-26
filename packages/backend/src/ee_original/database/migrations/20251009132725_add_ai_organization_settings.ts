import { Knex } from 'knex';

const aiOrganizationSettings = 'ai_organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(aiOrganizationSettings, (table) => {
        table
            .uuid('organization_uuid')
            .primary()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.boolean('ai_agents_visible').notNullable().defaultTo(true);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(aiOrganizationSettings);
}
