import { Knex } from 'knex';

const SAVED_SQL_TABLE_NAME = 'saved_sql';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SAVED_SQL_TABLE_NAME, (table) => {
        table.timestamp('last_viewed_at').defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SAVED_SQL_TABLE_NAME, 'last_viewed_at')) {
        await knex.schema.alterTable(SAVED_SQL_TABLE_NAME, (table) => {
            table.dropColumn('last_viewed_at');
        });
    }
}
