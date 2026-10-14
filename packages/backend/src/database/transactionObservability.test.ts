import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachTransactionObservability } from './transactionObservability';

const createDatabase = () => knex({ client: MockClient, dialect: 'pg' });

describe('attachTransactionObservability', () => {
    afterEach(() => {
        getTracker().reset();
    });

    it('leaves database.transaction untouched when rollback logging is disabled', () => {
        const database = createDatabase();
        const originalTransaction = database.transaction;

        attachTransactionObservability(database, { logRollbacks: false });

        expect(database.transaction).toBe(originalTransaction);
    });

    it('resolves a committed transaction with the callback result and logs nothing', async () => {
        const database = createDatabase();
        const log = vi.fn();
        attachTransactionObservability(
            database,
            { logRollbacks: true },
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
            { logRollbacks: true },
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
            { logRollbacks: true },
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
            { logRollbacks: true },
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
            { logRollbacks: true },
            { log },
        );

        const trx = await database.transaction();
        await trx.rollback();

        expect(trx.isCompleted()).toBe(true);
        expect(log).not.toHaveBeenCalled();
    });
});
