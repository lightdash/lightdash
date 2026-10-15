import { getErrorMessage } from '@lightdash/common';
import { type Knex } from 'knex';
import Logger from '../logging/logger';
import { getActiveSpanName } from '../tracing/tracing';
import { VERSION } from '../version';

export type TransactionObservabilityOptions = {
    logRollbacks: boolean;
};

type TransactionLogMetadata = {
    name: string;
    duration: number;
    context: Record<string, unknown>;
    serverVersion: string;
};

type TransactionObservabilityDependencies = {
    getCaller: () => string | undefined;
    log: (message: string, metadata: TransactionLogMetadata) => void;
    now: () => number;
};

const ROLLBACK_LOG_NAME = 'Knex.transactionRollback';

type TransactionScope = (trx: Knex.Transaction) => Promise<unknown> | void;

const isTransactionScope = (value: unknown): value is TransactionScope =>
    typeof value === 'function';

/**
 * Wraps callback-style `database.transaction(scope)` calls so a rolled-back
 * transaction logs its duration, caller and error. Committed transactions and
 * non-callback usages pass through untouched. No extra queries are issued.
 */
export const attachTransactionObservability = (
    database: Knex,
    options: TransactionObservabilityOptions,
    {
        getCaller = getActiveSpanName,
        log = (message, metadata) => Logger.warn(message, metadata),
        now = () => performance.now(),
    }: Partial<TransactionObservabilityDependencies> = {},
): void => {
    if (!options.logRollbacks) {
        return;
    }

    const originalTransaction = database.transaction;

    const logRollback = (
        caller: string | null,
        startedAt: number,
        error: unknown,
    ) => {
        const duration = now() - startedAt;
        const context = {
            source: 'knex',
            caller,
            error: getErrorMessage(error),
            serverVersion: String(VERSION),
        };
        try {
            log(
                `${ROLLBACK_LOG_NAME} - transaction rolled back after ${duration.toFixed(
                    2,
                )}ms - Context: ${JSON.stringify(context)}`,
                {
                    name: ROLLBACK_LOG_NAME,
                    duration,
                    context,
                    serverVersion: String(VERSION),
                },
            );
        } catch {
            // Observability must never change the transaction outcome.
        }
    };

    const observedTransaction = function observedTransaction(
        this: Knex,
        ...args: unknown[]
    ) {
        const [scope, config] = args;
        if (!isTransactionScope(scope)) {
            return (originalTransaction as Function).apply(this, args);
        }
        const caller = getCaller() ?? null;
        const startedAt = now();
        return (
            originalTransaction as (
                transactionScope: TransactionScope,
                transactionConfig?: Knex.TransactionConfig,
            ) => Promise<unknown>
        )
            .call(this, scope, config as Knex.TransactionConfig | undefined)
            .catch((error: unknown) => {
                logRollback(caller, startedAt, error);
                throw error;
            });
    };

    // Knex defines `transaction` as a non-writable, configurable property.
    Object.defineProperty(database, 'transaction', {
        value: observedTransaction,
        configurable: true,
    });
};
