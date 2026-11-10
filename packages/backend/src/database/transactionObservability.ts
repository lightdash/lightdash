import { getErrorMessage } from '@lightdash/common';
import { type Knex } from 'knex';
import Logger from '../logging/logger';
import { getActiveSpanName } from '../tracing/tracing';
import { VERSION } from '../version';

export type TransactionObservabilityOptions = {
    logRollbacks: boolean;
    /** Warn when a transaction takes at least this long; null disables it. */
    slowTransactionThresholdMs: number | null;
};

export type TransactionOutcome = 'commit' | 'rollback';

export type TransactionEndEvent = {
    caller: string | null;
    durationMs: number;
    outcome: TransactionOutcome;
};

type TransactionEndListener = (event: TransactionEndEvent) => void;

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
const SLOW_LOG_NAME = 'Knex.slowTransaction';

type TransactionScope = (trx: Knex.Transaction) => Promise<unknown> | void;

const isTransactionScope = (value: unknown): value is TransactionScope =>
    typeof value === 'function';

const listenersByDatabase = new WeakMap<Knex, Set<TransactionEndListener>>();

/**
 * Subscribe to the end of every observed callback-style transaction. Only
 * fires when `attachTransactionObservability` enabled the wrapper.
 */
export const onTransactionEnd = (
    database: Knex,
    listener: TransactionEndListener,
): (() => void) => {
    const listeners = listenersByDatabase.get(database) ?? new Set();
    listeners.add(listener);
    listenersByDatabase.set(database, listeners);
    return () => {
        listeners.delete(listener);
    };
};

const notifyListeners = (database: Knex, event: TransactionEndEvent) => {
    const listeners = listenersByDatabase.get(database);
    if (!listeners) return;
    listeners.forEach((listener) => {
        try {
            listener(event);
        } catch {
            // Observability must never change the transaction outcome.
        }
    });
};

/**
 * Wraps callback-style `database.transaction(scope)` calls so a rolled-back or
 * slow transaction logs its duration and caller. Committed transactions and
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
    const { logRollbacks, slowTransactionThresholdMs } = options;
    if (!logRollbacks && slowTransactionThresholdMs === null) {
        return;
    }

    const originalTransaction = database.transaction;
    const serverVersion = String(VERSION);

    const safeLog = (
        name: string,
        duration: number,
        summary: string,
        context: Record<string, unknown>,
    ) => {
        try {
            log(
                `${name} - ${summary} after ${duration.toFixed(
                    2,
                )}ms - Context: ${JSON.stringify(context)}`,
                { name, duration, context, serverVersion },
            );
        } catch {
            // Observability must never change the transaction outcome.
        }
    };

    const onSettled = (
        caller: string | null,
        startedAt: number,
        outcome: TransactionOutcome,
        error: unknown,
    ) => {
        const durationMs = now() - startedAt;
        if (outcome === 'rollback' && logRollbacks) {
            safeLog(ROLLBACK_LOG_NAME, durationMs, 'transaction rolled back', {
                source: 'knex',
                caller,
                error: getErrorMessage(error),
                serverVersion,
            });
        }
        if (
            slowTransactionThresholdMs !== null &&
            durationMs >= slowTransactionThresholdMs
        ) {
            safeLog(SLOW_LOG_NAME, durationMs, 'slow transaction settled', {
                source: 'knex',
                caller,
                outcome,
                thresholdMs: slowTransactionThresholdMs,
                serverVersion,
            });
        }
        notifyListeners(database, { caller, durationMs, outcome });
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
            .then(
                (result: unknown) => {
                    onSettled(caller, startedAt, 'commit', undefined);
                    return result;
                },
                (error: unknown) => {
                    onSettled(caller, startedAt, 'rollback', error);
                    throw error;
                },
            );
    };

    // Knex defines `transaction` as a non-writable, configurable property.
    Object.defineProperty(database, 'transaction', {
        value: observedTransaction,
        configurable: true,
    });
};
