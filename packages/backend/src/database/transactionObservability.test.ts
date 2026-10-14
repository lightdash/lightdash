import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    attachTransactionObservability,
    onTransactionEnd,
} from './transactionObservability';

const createDatabase = () => knex({ client: MockClient, dialect: 'pg' });

describe('attachTransactionObservability', () => {
    afterEach(() => {
        getTracker().reset();
    });

    it('leaves database.transaction untouched when nothing is enabled', () => {
        const database = createDatabase();
        const originalTransaction = database.transaction;

        attachTransactionObservability(database, {
            logRollbacks: false,
            slowTransactionThresholdMs: null,
        });

        expect(database.transaction).toBe(originalTransaction);
    });

    it('resolves a committed transaction with the callback result and logs nothing', async () => {
        const database = createDatabase();
        const log = vi.fn();
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: null },
            { log },
        );
        getTracker()
            .on.select('projects')
            .responseOnce([{ id: 1 }]);

        const result = await database.transaction(async (trx) => {
            const rows = await trx('projects').select('id');
            return rows.length;
        });

        expect(result).toBe(1);
        expect(log).not.toHaveBeenCalled();
        expect(getTracker().history.transactions).toHaveLength(1);
    });

    it('rethrows the original error and logs one warn line when a transaction rolls back', async () => {
        const database = createDatabase();
        const log = vi.fn();
        let clock = 1_000;
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: null },
            {
                log,
                getCaller: () => 'POST /api/v1/projects/:projectUuid/compile',
                now: () => {
                    clock += 250;
                    return clock;
                },
            },
        );
        const error = new Error(
            'terminating connection due to idle-in-transaction timeout',
        );

        await expect(
            database.transaction(async () => {
                throw error;
            }),
        ).rejects.toBe(error);

        expect(log).toHaveBeenCalledTimes(1);
        const [message, metadata] = log.mock.calls[0];
        expect(message).toContain('Knex.transactionRollback');
        expect(message).toContain('250.00ms');
        expect(metadata).toMatchObject({
            name: 'Knex.transactionRollback',
            duration: 250,
            context: {
                source: 'knex',
                caller: 'POST /api/v1/projects/:projectUuid/compile',
                error: 'terminating connection due to idle-in-transaction timeout',
            },
        });
    });

    it('records a null caller when no span is active', async () => {
        const database = createDatabase();
        const log = vi.fn();
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: null },
            { log, getCaller: () => undefined },
        );

        await expect(
            database.transaction(async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');

        expect(log.mock.calls[0][1].context.caller).toBeNull();
    });

    it('still rejects with the original error when logging itself throws', async () => {
        const database = createDatabase();
        const log = vi.fn(() => {
            throw new Error('logger down');
        });
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: null },
            { log },
        );
        const error = new Error('boom');

        await expect(
            database.transaction(async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });

    it('passes transaction-provider usage through without a callback', async () => {
        const database = createDatabase();
        const log = vi.fn();
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: null },
            { log },
        );

        const trx = await database.transaction();
        await trx.rollback();

        expect(trx.isCompleted()).toBe(true);
        expect(log).not.toHaveBeenCalled();
    });

    it('warns about a committed transaction that ran past the slow threshold', async () => {
        const database = createDatabase();
        const log = vi.fn();
        let clock = 0;
        attachTransactionObservability(
            database,
            { logRollbacks: false, slowTransactionThresholdMs: 1_000 },
            {
                log,
                getCaller: () => 'scheduler:compileProject',
                now: () => {
                    clock += 1_500;
                    return clock;
                },
            },
        );

        await expect(database.transaction(async () => 'done')).resolves.toBe(
            'done',
        );

        expect(log).toHaveBeenCalledTimes(1);
        const [message, metadata] = log.mock.calls[0];
        expect(message).toContain('Knex.slowTransaction');
        expect(metadata).toMatchObject({
            name: 'Knex.slowTransaction',
            duration: 1_500,
            context: {
                source: 'knex',
                caller: 'scheduler:compileProject',
                outcome: 'commit',
                thresholdMs: 1_000,
            },
        });
    });

    it('stays quiet for a committed transaction under the slow threshold', async () => {
        const database = createDatabase();
        const log = vi.fn();
        let clock = 0;
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: 1_000 },
            {
                log,
                now: () => {
                    clock += 10;
                    return clock;
                },
            },
        );

        await database.transaction(async () => undefined);

        expect(log).not.toHaveBeenCalled();
    });

    it('does not log a rollback line when only the slow threshold is enabled', async () => {
        const database = createDatabase();
        const log = vi.fn();
        attachTransactionObservability(
            database,
            { logRollbacks: false, slowTransactionThresholdMs: 60_000 },
            { log },
        );

        await expect(
            database.transaction(async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');

        expect(log).not.toHaveBeenCalled();
    });

    it('notifies transaction-end listeners for commits and rollbacks', async () => {
        const database = createDatabase();
        const events: unknown[] = [];
        let clock = 0;
        attachTransactionObservability(
            database,
            { logRollbacks: true, slowTransactionThresholdMs: null },
            {
                log: vi.fn(),
                getCaller: () => 'GET /api/v1/org',
                now: () => {
                    clock += 5;
                    return clock;
                },
            },
        );
        const unsubscribe = onTransactionEnd(database, (event) =>
            events.push(event),
        );

        await database.transaction(async () => undefined);
        await expect(
            database.transaction(async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        unsubscribe();
        await database.transaction(async () => undefined);

        expect(events).toEqual([
            { caller: 'GET /api/v1/org', durationMs: 5, outcome: 'commit' },
            { caller: 'GET /api/v1/org', durationMs: 5, outcome: 'rollback' },
        ]);
    });
});
