import { Knex } from 'knex';

const tableName = 'project_dbt_sources';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(tableName, (tableBuilder) => {
        // Where this source's models live in the project's warehouse. Null on
        // both columns means the source inherits the project's location, which
        // is the behaviour every existing row had.
        tableBuilder.text('warehouse_database').nullable();
        tableBuilder.text('warehouse_schema').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(tableName, (tableBuilder) => {
        tableBuilder.dropColumn('warehouse_database');
        tableBuilder.dropColumn('warehouse_schema');
    });
}
