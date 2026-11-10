import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable jsonb column to query_history without a default, a catalog-only change. The previous release neither reads nor writes it.',
};

const QueryHistoryTableName = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.jsonb('error_details').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.dropColumn('error_details');
    });
}
