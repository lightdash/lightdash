import { Knex } from 'knex';

const CATEGORIES_TABLE = 'project_announcement_categories';
const ANNOUNCEMENTS_TABLE = 'project_announcements';

// Announcement categories became an enum column (20260721170100); the uuid
// FK and lookup table shipped unused. Contract them here rather than editing
// the already-merged create migration — DBs that ran it must stay converged
// with DBs that never will. Guards make this a no-op on environments that
// migrated a pre-merge branch state.
export async function up(knex: Knex): Promise<void> {
    const hasColumn = await knex.schema.hasColumn(
        ANNOUNCEMENTS_TABLE,
        'category_uuid',
    );
    if (hasColumn) {
        await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
            table.dropColumn('category_uuid');
        });
    }
    await knex.schema.dropTableIfExists(CATEGORIES_TABLE);
}

export async function down(knex: Knex): Promise<void> {
    const hasTable = await knex.schema.hasTable(CATEGORIES_TABLE);
    if (!hasTable) {
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
    }
    const hasColumn = await knex.schema.hasColumn(
        ANNOUNCEMENTS_TABLE,
        'category_uuid',
    );
    if (!hasColumn) {
        await knex.schema.alterTable(ANNOUNCEMENTS_TABLE, (table) => {
            table
                .uuid('category_uuid')
                .references('category_uuid')
                .inTable(CATEGORIES_TABLE)
                .onDelete('SET NULL');
        });
    }
}
