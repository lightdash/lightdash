import { Knex } from 'knex';
import { AiWritebackThreadModel } from './AiWritebackThreadModel';

type AnyType = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// Build a model whose knex `client` exposes a mocked connection so the
// session-level advisory lock can be exercised without a real database.
const buildModel = (locked: boolean) => {
    const query = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) {
            return Promise.resolve({ rows: [{ locked }] });
        }
        return Promise.resolve({ rows: [{ pg_advisory_unlock: true }] });
    });
    const connection = { query };
    const acquireConnection = jest.fn().mockResolvedValue(connection);
    const releaseConnection = jest.fn().mockResolvedValue(undefined);
    const database = {
        client: { acquireConnection, releaseConnection },
    } as unknown as Knex;
    const model = new AiWritebackThreadModel({ database });
    return { model, query, acquireConnection, releaseConnection };
};

describe('AiWritebackThreadModel.acquireWorkstreamLock', () => {
    it('returns a release handle when pg_try_advisory_lock succeeds', async () => {
        const { model, query, releaseConnection } = buildModel(true);

        const handle = await model.acquireWorkstreamLock(
            'thread-1::new::acme/x',
        );

        expect(handle).not.toBeNull();
        expect(query).toHaveBeenCalledWith(
            'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
            ['thread-1::new::acme/x'],
        );
        // The lock is held — the connection is NOT returned to the pool yet.
        expect(releaseConnection).not.toHaveBeenCalled();
    });

    it('returns null and releases the connection when the lock is held by another session', async () => {
        const { model, releaseConnection } = buildModel(false);

        const handle = await model.acquireWorkstreamLock(
            'thread-1::new::acme/x',
        );

        expect(handle).toBeNull();
        // A contended lock must not leak the pinned connection.
        expect(releaseConnection).toHaveBeenCalledTimes(1);
    });

    it('release() unlocks and returns the connection to the pool', async () => {
        const { model, query, releaseConnection } = buildModel(true);

        const handle = await model.acquireWorkstreamLock('k');
        await handle!.release();

        expect(query).toHaveBeenCalledWith(
            'SELECT pg_advisory_unlock(hashtext($1))',
            ['k'],
        );
        expect(releaseConnection).toHaveBeenCalledTimes(1);
    });

    it('releases the connection if the lock query throws', async () => {
        const query = jest.fn().mockRejectedValue(new Error('db down'));
        const releaseConnection = jest.fn().mockResolvedValue(undefined);
        const database = {
            client: {
                acquireConnection: jest.fn().mockResolvedValue({ query }),
                releaseConnection,
            },
        } as unknown as Knex;
        const model = new AiWritebackThreadModel({ database });

        await expect(model.acquireWorkstreamLock('k')).rejects.toThrow(
            'db down',
        );
        expect(releaseConnection).toHaveBeenCalledTimes(1);
    });
});
