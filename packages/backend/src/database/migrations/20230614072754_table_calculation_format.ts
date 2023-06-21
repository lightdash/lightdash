import { Knex } from 'knex';

const TableCalculationTableName = 'saved_queries_version_table_calculations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TableCalculationTableName, (tableBuilder) => {
        tableBuilder.jsonb('format').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TableCalculationTableName, (tableBuilder) => {
        tableBuilder.dropColumns('format');
    });
}
