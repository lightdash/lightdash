import { Knex } from 'knex';

const ProjectsTable = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectsTable, (table) => {
        table.jsonb('table_groups').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectsTable, (table) => {
        table.dropColumn('table_groups');
    });
}
