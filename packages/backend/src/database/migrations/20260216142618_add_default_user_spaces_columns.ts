import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const SPACES_TABLE = 'spaces';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.boolean('has_default_user_spaces').notNullable().defaultTo(false);
    });

    await knex.schema.alterTable(SPACES_TABLE, (table) => {
        table.boolean('is_default_user_space').notNullable().defaultTo(false);
    });

    await knex.raw(`
        CREATE UNIQUE INDEX spaces_unique_default_user_space_per_project
        ON ${SPACES_TABLE} (project_id, created_by_user_id)
        WHERE is_default_user_space = true AND deleted_at IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        'DROP INDEX IF EXISTS spaces_unique_default_user_space_per_project',
    );

    await knex.schema.alterTable(SPACES_TABLE, (table) => {
        table.dropColumn('is_default_user_space');
    });

    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.dropColumn('has_default_user_spaces');
    });
}
