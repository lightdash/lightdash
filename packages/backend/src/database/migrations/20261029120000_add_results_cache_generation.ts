import { Knex } from 'knex';

const ProjectTableName = 'projects';
const QueryHistoryTableName = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.integer('results_cache_generation').notNullable().defaultTo(0);
        table
            .timestamp('results_cache_invalidated_at', { useTz: true })
            .nullable();
    });
    // Constant default: metadata-only on PG11+, no table rewrite
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.integer('cache_generation').notNullable().defaultTo(0);
        table.timestamp('cache_invalidated_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.dropColumn('cache_invalidated_at');
        table.dropColumn('cache_generation');
    });
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn('results_cache_invalidated_at');
        table.dropColumn('results_cache_generation');
    });
}
