import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';
const PRE_AGGREGATE_COMPILED_SQL_COLUMN = 'pre_aggregate_compiled_sql';
const CREATED_BY_ACTOR_TYPE_COLUMN = 'created_by_actor_type';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.text(PRE_AGGREGATE_COMPILED_SQL_COLUMN).nullable();
        table.string(CREATED_BY_ACTOR_TYPE_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(CREATED_BY_ACTOR_TYPE_COLUMN);
        table.dropColumn(PRE_AGGREGATE_COMPILED_SQL_COLUMN);
    });
}
