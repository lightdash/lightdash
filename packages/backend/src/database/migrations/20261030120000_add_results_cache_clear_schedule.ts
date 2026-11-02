import { Knex } from 'knex';

const ProjectTableName = 'projects';
const NextRunIndexName = 'projects_results_cache_clear_next_run_at_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.text('results_cache_clear_cron').nullable();
        table
            .timestamp('results_cache_clear_next_run_at', { useTz: true })
            .nullable();
    });
    await knex.raw(
        `CREATE INDEX ${NextRunIndexName} ON ${ProjectTableName} (results_cache_clear_next_run_at) WHERE results_cache_clear_next_run_at IS NOT NULL`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`DROP INDEX IF EXISTS ${NextRunIndexName}`);
    await knex.schema.alterTable(ProjectTableName, (table) => {
        table.dropColumn('results_cache_clear_next_run_at');
        table.dropColumn('results_cache_clear_cron');
    });
}
