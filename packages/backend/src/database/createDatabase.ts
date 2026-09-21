import knex, { type Knex } from 'knex';
import { attachExploreCacheStatementMetrics } from '../logging/exploreCacheReadMetrics';

export const createDatabase = (
    config: Knex.Config<Knex.PgConnectionConfig>,
): Knex => {
    const database = knex(config);
    attachExploreCacheStatementMetrics(database);
    return database;
};
