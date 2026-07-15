import { Knex } from 'knex';

const HOMEPAGES_TABLE = 'homepages';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(HOMEPAGES_TABLE, (table) => {
        table
            .uuid('homepage_uuid')
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
        table.jsonb('draft_config').notNullable();
        table.jsonb('published_config').nullable();
        table.boolean('is_default').notNullable().defaultTo(false);
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
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
        CREATE UNIQUE INDEX homepages_one_default_per_project
        ON homepages (project_uuid) WHERE is_default = true
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(HOMEPAGES_TABLE);
}
