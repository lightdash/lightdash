import { Knex } from 'knex';

const savedQueriesVersionsTable = 'saved_queries_versions';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.alterTable(savedQueriesVersionsTable, (table) => {
        table.string('timezone');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(savedQueriesVersionsTable, 'timezone')) {
        await knex.schema.alterTable(savedQueriesVersionsTable, (table) => {
            table.dropColumn('timezone');
        });
    }
}
