import { Knex } from 'knex';

const OrganizationBrandsTable = 'organization_brands';
const OrganizationsTable = 'organizations';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(OrganizationBrandsTable))) {
        await knex.schema.createTable(OrganizationBrandsTable, (table) => {
            // PK doubles as the FK-covering index; one brand profile per organization.
            table
                .uuid('organization_uuid')
                .primary()
                .references('organization_uuid')
                .inTable(OrganizationsTable)
                .onDelete('CASCADE');
            table.string('domain').notNullable();
            table.jsonb('brand').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(OrganizationBrandsTable);
}
