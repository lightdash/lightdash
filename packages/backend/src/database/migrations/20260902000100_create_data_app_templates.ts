import { Knex } from 'knex';

const DataAppTemplatesTable = 'data_app_templates';
const DataAppTemplateFilesTable = 'data_app_template_files';
const OrganizationsTable = 'organizations';
const UsersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(DataAppTemplatesTable, (table) => {
        table
            .uuid('template_uuid')
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
        table.text('slug').notNullable();
        table.text('name').notNullable();
        table.text('description').notNullable();
        table.text('category').notNullable();
        // Declared questions from the manifest; the create-from-template
        // form renders these and the answers travel as clarifications.
        table.jsonb('questions').notNullable().defaultTo('[]');
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(UsersTable)
            .onDelete('SET NULL')
            .index();
        table.unique(['organization_uuid', 'slug']);
    });

    // One row per authored file in the package; the bytes live in object
    // storage under the template's prefix, keyed by filename.
    await knex.schema.createTable(DataAppTemplateFilesTable, (table) => {
        table
            .uuid('file_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('template_uuid')
            .notNullable()
            .references('template_uuid')
            .inTable(DataAppTemplatesTable)
            .onDelete('CASCADE')
            .index();
        table.text('filename').notNullable();
        table.integer('size_bytes').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['template_uuid', 'filename']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(DataAppTemplateFilesTable);
    await knex.schema.dropTableIfExists(DataAppTemplatesTable);
}
