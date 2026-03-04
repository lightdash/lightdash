import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const PROJECT_DEFAULTS_COLUMN = 'project_defaults';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(PROJECTS_TABLE, (table) => {
        table.jsonb(PROJECT_DEFAULTS_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(PROJECTS_TABLE, (table) => {
        table.dropColumn(PROJECT_DEFAULTS_COLUMN);
    });
}