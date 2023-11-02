import { Knex } from 'knex';

const CACHED_EXPLORE_TABLE_NAME = 'cached_explore';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CACHED_EXPLORE_TABLE_NAME))) {
        await knex.schema.createTable(CACHED_EXPLORE_TABLE_NAME, (table) => {
            table
                .uuid('cached_explore_uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .notNullable()
                .onDelete('CASCADE');
            table.string('name').notNullable();
            table.specificType('table_names', 'TEXT[]').notNullable();
            table.jsonb('explore').notNullable();
            table.unique(['name', 'project_uuid']); // can't have duplicate explore names in the same project
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CACHED_EXPLORE_TABLE_NAME);
}
