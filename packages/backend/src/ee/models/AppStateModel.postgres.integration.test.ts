import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { AppStateModel } from './AppStateModel';

describe('AppStateModel.cleanupHistoryBatch (PostgreSQL)', () => {
    let database: Knex;
    let tx: Knex.Transaction;
    let model: AppStateModel;
    const appUuid = randomUUID();

    const daysAgo = (days: number) =>
        new Date(Date.now() - days * 24 * 3600 * 1000);

    // The temp table shadows the registered knex table type, which forbids
    // explicit created_at inserts.
    type HistoryRow = {
        app_uuid: string;
        key: string;
        version: number;
        value: string;
        author_kind: string;
        author_user_uuid: string | null;
        created_at: Date;
    };

    const insertHistory = async ({
        app = appUuid,
        key,
        version,
        createdAt,
    }: {
        app?: string;
        key: string;
        version: number;
        createdAt: Date;
    }) => {
        await tx<HistoryRow>('app_shared_state_history').insert({
            app_uuid: app,
            key,
            version,
            value: JSON.stringify({ version }),
            author_kind: 'user',
            author_user_uuid: null,
            created_at: createdAt,
        });
    };

    const versionsOf = async (key: string, app = appUuid) =>
        (
            await tx<HistoryRow>('app_shared_state_history')
                .select('version')
                .where({ app_uuid: app, key })
                .orderBy('version', 'asc')
        ).map((row) => row.version);

    beforeAll(() => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI)
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables for PostgreSQL tests',
            );
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });
    beforeEach(async () => {
        tx = await database.transaction();
        await tx.raw(
            `CREATE TEMP TABLE app_shared_state_history (
                app_shared_state_history_uuid uuid DEFAULT gen_random_uuid(),
                app_uuid uuid,
                key text,
                version integer,
                value jsonb,
                author_kind text,
                author_user_uuid uuid,
                created_at timestamptz DEFAULT clock_timestamp(),
                UNIQUE (app_uuid, key, version)
            ) ON COMMIT DROP`,
        );
        model = new AppStateModel({ database: tx });
    });
    afterEach(async () => {
        await tx?.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    const generous = { batchSize: 1000, delayMs: 0, maxBatches: 10 };

    it('deletes expired versions but keeps the newest N per key regardless of age', async () => {
        // 10 versions, all older than the cutoff
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                insertHistory({
                    key: 'thread',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
        );

        const result = await model.cleanupHistoryBatch(
            daysAgo(90),
            3,
            generous,
        );

        expect(result).toEqual({
            totalDeleted: 7,
            batchCount: 1,
            completed: true,
        });
        expect(await versionsOf('thread')).toEqual([8, 9, 10]);
    });

    it('keeps rows newer than the cutoff even beyond the newest N', async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                insertHistory({
                    key: 'thread',
                    version: i + 1,
                    createdAt: daysAgo(1),
                }),
            ),
        );

        const result = await model.cleanupHistoryBatch(
            daysAgo(90),
            3,
            generous,
        );

        expect(result.totalDeleted).toBe(0);
        expect(await versionsOf('thread')).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        ]);
    });

    it('prunes each (app, key) scope independently', async () => {
        const otherApp = randomUUID();
        await Promise.all([
            ...Array.from({ length: 5 }, (_, i) =>
                insertHistory({
                    key: 'a',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
            ...Array.from({ length: 5 }, (_, i) =>
                insertHistory({
                    key: 'b',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
            ...Array.from({ length: 5 }, (_, i) =>
                insertHistory({
                    app: otherApp,
                    key: 'a',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
        ]);

        await model.cleanupHistoryBatch(daysAgo(90), 2, generous);

        expect(await versionsOf('a')).toEqual([4, 5]);
        expect(await versionsOf('b')).toEqual([4, 5]);
        expect(await versionsOf('a', otherApp)).toEqual([4, 5]);
    });

    it('always keeps at least one version so a recreated key continues the counter', async () => {
        await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
                insertHistory({
                    key: 'deleted-key',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
        );

        const result = await model.cleanupHistoryBatch(
            daysAgo(90),
            0,
            generous,
        );

        expect(result.totalDeleted).toBe(4);
        expect(await versionsOf('deleted-key')).toEqual([5]);
    });

    it('stops at the batch cap and reports an incomplete run', async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                insertHistory({
                    key: 'thread',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
        );

        const result = await model.cleanupHistoryBatch(daysAgo(90), 1, {
            batchSize: 2,
            delayMs: 0,
            maxBatches: 2,
        });

        expect(result).toEqual({
            totalDeleted: 4,
            batchCount: 2,
            completed: false,
        });
        // Oldest versions go first
        expect(await versionsOf('thread')).toEqual([5, 6, 7, 8, 9, 10]);
    });

    it('clears the backlog across batches when allowed to continue', async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                insertHistory({
                    key: 'thread',
                    version: i + 1,
                    createdAt: daysAgo(100),
                }),
            ),
        );

        const result = await model.cleanupHistoryBatch(daysAgo(90), 1, {
            batchSize: 2,
            delayMs: 0,
            maxBatches: 10,
        });

        expect(result).toEqual({
            totalDeleted: 9,
            batchCount: 5,
            completed: true,
        });
        expect(await versionsOf('thread')).toEqual([10]);
    });
});
