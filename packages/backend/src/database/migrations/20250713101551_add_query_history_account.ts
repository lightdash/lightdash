import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';
const CREATED_BY_ACCOUNT_COLUMN = 'created_by_account';

export async function up(knex: Knex): Promise<void> {
    // 1. Add a new nullable "createdByAccount" column of type string
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.string(CREATED_BY_ACCOUNT_COLUMN).nullable();
    });

    // 2. Add indexes on the new column
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.index([CREATED_BY_ACCOUNT_COLUMN]);
    });
}

export async function down(knex: Knex): Promise<void> {
    // Remove index
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropIndex([CREATED_BY_ACCOUNT_COLUMN]);
    });

    // Remove the created_by_account column
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(CREATED_BY_ACCOUNT_COLUMN);
    });
}
