import { Knex } from 'knex';

const ProjectTableName = 'projects';
const ColumnName = 'system_explores_enabled';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.boolean(ColumnName).defaultTo(false).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
