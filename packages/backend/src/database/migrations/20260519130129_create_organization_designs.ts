import { Knex } from 'knex';

const OrganizationDesignsTable = 'organization_designs';
const OrganizationDesignFilesTable = 'organization_design_files';
const OrganizationsTable = 'organizations';
const UsersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(OrganizationDesignsTable, (table) => {
        table
            .uuid('design_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(OrganizationsTable)
            .onDelete('CASCADE')
            .index();
        table.text('name').notNullable();
        table.text('description').nullable();
        table.boolean('is_default').notNullable().defaultTo(false);
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(UsersTable)
            .onDelete('SET NULL')
            .index();
    });

    // At most one default design per organization. Partial unique index so
    // multiple non-default rows are still allowed.
    await knex.raw(`
        CREATE UNIQUE INDEX organization_designs_one_default_per_org
        ON ${OrganizationDesignsTable} (organization_uuid)
        WHERE is_default = true
    `);

    await knex.schema.createTable(OrganizationDesignFilesTable, (table) => {
        table
            .uuid('file_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('design_uuid')
            .notNullable()
            .references('design_uuid')
            .inTable(OrganizationDesignsTable)
            .onDelete('CASCADE')
            .index();
        // 'css' | 'font' | 'image' | 'instruction' — validated at application
        // layer; kept as text to avoid a PG enum migration when new kinds
        // are added.
        table.text('kind').notNullable();
        table.text('filename').notNullable();
        table.text('content_type').notNullable();
        table.integer('size_bytes').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(UsersTable)
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(OrganizationDesignFilesTable);
    await knex.schema.dropTableIfExists(OrganizationDesignsTable);
}
