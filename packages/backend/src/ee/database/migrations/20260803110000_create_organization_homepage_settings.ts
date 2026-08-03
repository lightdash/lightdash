import { Knex } from 'knex';

const OrganizationHomepageSettingsTableName = 'organization_homepage_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        OrganizationHomepageSettingsTableName,
        (table) => {
            table
                .uuid('organization_uuid')
                .primary()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.boolean('enabled').notNullable().defaultTo(false);
            table.text('opening').nullable();
            table
                .timestamp('created_at')
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at')
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(OrganizationHomepageSettingsTableName);
}
