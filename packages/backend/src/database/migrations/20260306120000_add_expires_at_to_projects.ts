import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const EXPIRES_AT_COLUMN = 'expires_at';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table(PROJECTS_TABLE, (table) => {
        table.timestamp(EXPIRES_AT_COLUMN, { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(PROJECTS_TABLE, (table) => {
        table.dropColumn(EXPIRES_AT_COLUMN);
    });
}
