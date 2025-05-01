import { Knex } from 'knex';
import { ResultsCacheStatus } from '../../services/CacheService/types';

const RESULTS_CACHE_TABLE = 'results_cache';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RESULTS_CACHE_TABLE, (table) => {
        table
            .string('status')
            .notNullable()
            .defaultTo(ResultsCacheStatus.PENDING);
    });

    // Set all existing cache entries to READY
    await knex(RESULTS_CACHE_TABLE).update({
        status: ResultsCacheStatus.READY,
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RESULTS_CACHE_TABLE, (table) => {
        table.dropColumn('status');
    });
}
