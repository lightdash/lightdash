import { Knex } from 'knex';

const ProjectTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ProjectTableName)) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder
                .boolean('use_project_timezone_in_filters')
                .notNullable()
                .defaultTo(false);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ProjectTableName)) {
        await knex.schema.alterTable(ProjectTableName, (tableBuilder) => {
            tableBuilder.dropColumn('use_project_timezone_in_filters');
        });
    }
}
