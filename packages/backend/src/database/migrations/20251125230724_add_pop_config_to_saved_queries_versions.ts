import { Knex } from 'knex';

const SavedQueriesVersionsTableName = 'saved_queries_versions';
const PeriodOverPeriodConfigColumnName = 'period_over_period_config';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.jsonb(PeriodOverPeriodConfigColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SavedQueriesVersionsTableName, (table) => {
        table.dropColumn(PeriodOverPeriodConfigColumnName);
    });
}
