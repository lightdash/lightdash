import knex, { type Knex } from 'knex';
import { attachExploreCacheStatementMetrics } from '../logging/exploreCacheReadMetrics';
import {
    attachTransactionObservability,
    type TransactionObservabilityOptions,
} from './transactionObservability';

export const createDatabase = (
    config: Knex.Config<Knex.PgConnectionConfig>,
    transactionObservability: TransactionObservabilityOptions,
): Knex => {
    const database = knex(config);
    attachExploreCacheStatementMetrics(database);
    attachTransactionObservability(database, transactionObservability);
    return database;
};
