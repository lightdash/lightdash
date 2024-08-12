import { Knex } from 'knex';

export const SAVED_SQL_TABLE_NAME = 'saved_sql';
export const SAVED_SQL_VERSIONS_TABLE_NAME = 'saved_sql_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SAVED_SQL_TABLE_NAME, (table) => {
        table.integer('limit').nullable();
    });
    await knex.schema.alterTable(SAVED_SQL_VERSIONS_TABLE_NAME, (table) => {
        table.integer('limit').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SAVED_SQL_TABLE_NAME, 'limit')) {
        await knex.schema.alterTable(SAVED_SQL_TABLE_NAME, (table) => {
            table.dropColumn('limit');
        });
    }

    if (await knex.schema.hasColumn(SAVED_SQL_VERSIONS_TABLE_NAME, 'limit')) {
        await knex.schema.alterTable(SAVED_SQL_VERSIONS_TABLE_NAME, (table) => {
            table.dropColumn('limit');
        });
    }
}
