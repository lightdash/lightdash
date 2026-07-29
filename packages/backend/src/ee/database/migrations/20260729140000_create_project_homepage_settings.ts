import { Knex } from 'knex';

const PROJECT_HOMEPAGE_SETTINGS_TABLE = 'project_homepage_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(PROJECT_HOMEPAGE_SETTINGS_TABLE, (table) => {
        // One row per project: the settings *are* the project's, so the
        // project uuid is the key rather than a surrogate.
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        // 'ask-first' | 'content-first'. Nullable means the admin hasn't
        // chosen, and the layout falls back to whether AI is available.
        table.text('opening').nullable();
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

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PROJECT_HOMEPAGE_SETTINGS_TABLE);
}
