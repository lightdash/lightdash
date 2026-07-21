import { Knex } from 'knex';

const CATEGORIES_TABLE = 'project_announcement_categories';
const ANNOUNCEMENTS_TABLE = 'project_announcements';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(CATEGORIES_TABLE, (table) => {
        table
            .uuid('category_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('name').notNullable();
        table.text('color').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'name']);
    });

    await knex.schema.createTable(ANNOUNCEMENTS_TABLE, (table) => {
        table
            .uuid('announcement_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('title').notNullable();
        table.text('body').nullable();
        table
            .uuid('category_uuid')
            .nullable()
            .references('category_uuid')
            .inTable(CATEGORIES_TABLE)
            .onDelete('SET NULL');
        table.boolean('pinned').notNullable().defaultTo(false);
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.raw(`
        CREATE UNIQUE INDEX project_announcements_one_pinned_per_project
        ON ${ANNOUNCEMENTS_TABLE} (project_uuid) WHERE pinned = true
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ANNOUNCEMENTS_TABLE);
    await knex.schema.dropTableIfExists(CATEGORIES_TABLE);
}
