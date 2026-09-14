import { Knex } from 'knex';

const ProjectTableName = 'projects';
const ColumnName = 'results_cache_ttl_seconds';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        // null means the instance-wide CACHE_STALE_TIME_SECONDS applies
        table.integer(ColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
