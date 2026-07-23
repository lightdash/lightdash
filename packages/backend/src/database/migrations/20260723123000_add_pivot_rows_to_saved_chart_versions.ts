import { Knex } from 'knex';

const SavedChartVersionsTableName = 'saved_queries_versions';
const PivotRowsColumnName = 'pivot_rows';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedChartVersionsTableName, (table) => {
        table.specificType(PivotRowsColumnName, 'TEXT[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedChartVersionsTableName, (table) => {
        table.dropColumn(PivotRowsColumnName);
    });
}
