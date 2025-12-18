import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.string('created_via', 50).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.dropColumn('created_via');
    });
}
