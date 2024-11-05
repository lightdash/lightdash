import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const TAGS_TABLE = 'tags';
const CATALOG_SEARCH_TABLE = 'catalog_search';
const CATALOG_SEARCH_TAGS_TABLE = 'catalog_search_tags';

export async function up(knex: Knex): Promise<void> {
    // Add ID column to catalog_search
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table
            .uuid('catalog_search_uuid')
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .notNullable()
            .primary();
    });

    // Create tags table
    if (!(await knex.schema.hasTable(TAGS_TABLE))) {
        await knex.schema.createTable(TAGS_TABLE, (table) => {
            table
                .uuid('tag_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable(PROJECTS_TABLE)
                .onDelete('CASCADE');
            table.text('name').notNullable();
            table.text('color').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');

            // Prevent duplicate tag names within same project
            table.unique(['project_uuid', 'name']);
        });
    }

    // Create join table between catalog_search and tags
    if (!(await knex.schema.hasTable(CATALOG_SEARCH_TAGS_TABLE))) {
        await knex.schema.createTable(CATALOG_SEARCH_TAGS_TABLE, (table) => {
            table
                .uuid('catalog_search_uuid')
                .notNullable()
                .references('catalog_search_uuid')
                .inTable(CATALOG_SEARCH_TABLE)
                .onDelete('CASCADE');
            table
                .uuid('tag_uuid')
                .notNullable()
                .references('tag_uuid')
                .inTable(TAGS_TABLE)
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL');

            table.primary(['catalog_search_uuid', 'tag_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CATALOG_SEARCH_TAGS_TABLE);
    await knex.schema.dropTableIfExists(TAGS_TABLE);

    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.dropColumn('catalog_search_uuid');
    });
}
