import { Knex } from 'knex';

const savedQueriesVersionsTable = 'saved_queries_versions';
const columnName = 'query_strategy';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(savedQueriesVersionsTable, (t) => {
        t.text(columnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(savedQueriesVersionsTable, (t) => {
        t.dropColumn(columnName);
    });
}
