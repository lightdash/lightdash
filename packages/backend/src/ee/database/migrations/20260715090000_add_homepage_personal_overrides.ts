import { Knex } from 'knex';

const OVERRIDES_TABLE = 'homepage_personal_overrides';
const HOMEPAGES_TABLE = 'homepages';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(HOMEPAGES_TABLE, (table) => {
        table.boolean('allow_personal').notNullable().defaultTo(true);
    });
    await knex.schema.createTable(OVERRIDES_TABLE, (table) => {
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('dashboard_uuid')
            .notNullable()
            .references('dashboard_uuid')
            .inTable('dashboards')
            .onDelete('CASCADE');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.primary(['user_uuid', 'project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(OVERRIDES_TABLE);
    await knex.schema.alterTable(HOMEPAGES_TABLE, (table) => {
        table.dropColumn('allow_personal');
    });
}
