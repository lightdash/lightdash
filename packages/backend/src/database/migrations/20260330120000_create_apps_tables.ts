import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable('apps', (table) => {
        table
            .uuid('app_id')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.text('name').notNullable().defaultTo('');
        table.text('description').notNullable().defaultTo('');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('space_uuid')
            .references('space_uuid')
            .inTable('spaces')
            .onDelete('SET NULL');
        table.index('project_uuid');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.uuid('created_by_user_uuid').notNullable();
        table.timestamp('deleted_at', { useTz: false });
        table.uuid('deleted_by_user_uuid');
    });

    await knex.schema.createTable('app_versions', (table) => {
        table
            .uuid('app_version_id')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('app_id')
            .notNullable()
            .references('app_id')
            .inTable('apps')
            .onDelete('CASCADE');
        table.integer('version').notNullable();
        table.text('prompt').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.text('status').notNullable();
        table.text('error');
        table.uuid('created_by_user_uuid').notNullable();

        table.unique(['app_id', 'version']);
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists('app_versions');
    await knex.schema.dropTableIfExists('apps');
};
