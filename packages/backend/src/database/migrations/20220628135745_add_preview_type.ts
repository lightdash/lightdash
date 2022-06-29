import { Knex } from 'knex';

const ProjectTableName = 'projects';
const ProjectTypeTableName = 'project_type';
const ProjectTypeColumn = 'project_type';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ProjectTypeTableName, (tableBuilder) => {
        tableBuilder.string(ProjectTypeColumn).primary();
    });
    await knex(ProjectTypeTableName).insert([
        { [ProjectTypeColumn]: 'DEFAULT' },
        { [ProjectTypeColumn]: 'PREVIEW' },
    ]);

    await knex.schema.table(ProjectTableName, (table) => {
        table
            .string(ProjectTypeColumn)
            .notNullable()
            .defaultTo('DEFAULT')
            .references(ProjectTypeColumn)
            .inTable(ProjectTypeTableName)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(ProjectTableName, ProjectTypeColumn)) {
        await knex.schema.table(ProjectTableName, (table) => {
            table.dropColumns(ProjectTypeColumn);
        });
    }
    await knex.schema.dropTableIfExists(ProjectTypeTableName);
}
