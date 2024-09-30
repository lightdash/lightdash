import { Knex } from 'knex';

const ProjectTableName = 'projects';
const DbtTypeColumnName = 'dbt_connection_type';
const DbtConnectionColumnName = 'dbt_connection';

const DbtConnectionTypesTableName = 'dbt_connection_types';
const DbtConnectionTypeColumnName = 'dbt_connection_type';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        DbtConnectionTypesTableName,
        (tableBuilder) => {
            tableBuilder.string(DbtConnectionTypeColumnName).primary();
        },
    );
    await knex(DbtConnectionTypesTableName).insert([
        { [DbtConnectionTypeColumnName]: 'dbt' },
        { [DbtConnectionTypeColumnName]: 'dbt_remote_server' },
        { [DbtConnectionTypeColumnName]: 'dbt_cloud_ide' },
        { [DbtConnectionTypeColumnName]: 'github' },
        { [DbtConnectionTypeColumnName]: 'gitlab' },
    ]);

    await knex.schema.table(ProjectTableName, (table) => {
        table
            .string(DbtTypeColumnName)
            .references(DbtConnectionTypeColumnName)
            .inTable(DbtConnectionTypesTableName)
            .onDelete('CASCADE');
        table.binary(DbtConnectionColumnName);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(ProjectTableName, DbtConnectionColumnName)
    ) {
        await knex.schema.table(ProjectTableName, (table) => {
            table.dropColumns(DbtTypeColumnName, DbtConnectionColumnName);
        });
    }
    await knex.schema.dropTableIfExists(DbtConnectionTypesTableName);
}
