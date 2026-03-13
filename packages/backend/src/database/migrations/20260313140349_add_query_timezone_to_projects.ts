import { Knex } from 'knex';

const ProjectTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ProjectTableName)) {
        await knex.schema.alterTable(ProjectTableName, (table) => {
            table.string('query_timezone').nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ProjectTableName)) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder.dropColumn('query_timezone');
        });
    }
}
