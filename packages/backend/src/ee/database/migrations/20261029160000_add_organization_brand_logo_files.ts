import { type Knex } from 'knex';

const OrganizationBrandLogoFilesTable = 'organization_brand_logo_files';

export const classification = {
    kind: 'safe',
    reason: 'Adds a new table for uploaded organization brand logos without changing existing tables.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(OrganizationBrandLogoFilesTable, (table) => {
        table
            .uuid('logo_file_uuid')
            .primary()
            .defaultTo(knex.raw('gen_random_uuid()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table.text('content_type').notNullable();
        table.binary('data').notNullable();
        table.integer('size_bytes').notNullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(OrganizationBrandLogoFilesTable);
}
