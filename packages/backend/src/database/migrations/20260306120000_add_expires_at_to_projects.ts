import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const EXPIRES_AT_COLUMN = 'expires_at';
const TYPE_EXPIRES_AT_INDEX = 'projects_project_type_expires_at_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(PROJECTS_TABLE, (table) => {
        table.timestamp(EXPIRES_AT_COLUMN, { useTz: true }).nullable();
        table.index(['project_type', EXPIRES_AT_COLUMN], TYPE_EXPIRES_AT_INDEX);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(PROJECTS_TABLE, (table) => {
        table.dropIndex(
            ['project_type', EXPIRES_AT_COLUMN],
            TYPE_EXPIRES_AT_INDEX,
        );
        table.dropColumn(EXPIRES_AT_COLUMN);
    });
}
