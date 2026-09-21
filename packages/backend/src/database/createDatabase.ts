import knex, { type Knex } from 'knex';
import { attachExploreCacheReadMetrics } from '../logging/exploreCacheReadMetrics';

export const createDatabase = (
    config: Knex.Config<Knex.PgConnectionConfig>,
): Knex => {
    const database = knex(config);
    attachExploreCacheReadMetrics(database);
    return database;
};
