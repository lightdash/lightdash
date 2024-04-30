import { Knex } from 'knex';

const tableCalculationVersionsTable =
    'saved_queries_version_table_calculations';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.alterTable(tableCalculationVersionsTable, (table) => {
        table.string('type');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(tableCalculationVersionsTable, 'type')) {
        await knex.schema.alterTable(tableCalculationVersionsTable, (table) => {
            table.dropColumn('type');
        });
    }
}
