import { Knex } from 'knex';

const SAVED_CHART_VERSIONS_TABLE_NAME = 'saved_queries_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SAVED_CHART_VERSIONS_TABLE_NAME, (table) => {
        table.jsonb('parameters').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SAVED_CHART_VERSIONS_TABLE_NAME, (table) => {
        table.dropColumn('parameters');
    });
}
