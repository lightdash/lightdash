import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { getTestContext } from '../../vitest.setup.integration';
import { RefreshTokenRotation, type RefreshRun } from './RefreshTokenRotation';

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

describe('RefreshTokenRotation (PostgreSQL)', () => {
    let database: Knex;
    const tableName = `refresh_rotation_test_${randomUUID().replaceAll('-', '')}`;

    beforeAll(async () => {
        database = getTestContext().db;
        await database.schema.createTable(tableName, (table) => {
            table.uuid('uuid').primary();
            table.text('refresh_token').notNullable();
        });
    });

    afterAll(async () => {
        await database.schema.dropTableIfExists(tableName);
    });

    test('refreshes with a pool of one using the held connection for the read and savepoint', async () => {
        const singleConnection = knex({
            ...database.client.config,
            pool: { min: 0, max: 1 },
            acquireConnectionTimeout: 500,
        });
        const uuid = randomUUID();
        try {
            await singleConnection(tableName).insert({
                uuid,
                refresh_token: 'before',
            });
            const rotation = RefreshTokenRotation.forDatabase(singleConnection);
            const exchange = vi.fn().mockResolvedValue('after');
            await rotation.run({
                key: { kind: 'project', uuid, purpose: null },
                shareKey: 'single-connection',
                readCurrentRefreshToken: async (trx) => {
                    const row = await trx<{
                        uuid: string;
                        refresh_token: string;
                    }>(tableName)
                        .where({ uuid })
                        .first();
                    return row?.refresh_token ?? null;
                },
                exchange,
                persist: async ({ lockedRefreshToken, result, trx }) => {
                    await trx.transaction(async (savepoint) => {
                        expect(
                            await savepoint(tableName)
                                .where({
                                    uuid,
                                    refresh_token: lockedRefreshToken,
                                })
                                .update({ refresh_token: result }),
                        ).toBe(1);
                    });
                },
            });
            expect(exchange).toHaveBeenCalledExactlyOnceWith('before');
            expect(
                await singleConnection(tableName).where({ uuid }).first(),
            ).toMatchObject({ refresh_token: 'after' });
        } finally {
            await singleConnection.destroy();
        }
    });

    test('saves the rotation when another transaction holds the row longer than the advisory lock wait', async () => {
        const uuid = randomUUID();
        await database(tableName).insert({ uuid, refresh_token: 'before' });
        const rowHeld = deferred();
        const releaseRow = deferred();
        const holder = database.transaction(async (trx) => {
            await trx(tableName).where({ uuid }).forUpdate().first();
            rowHeld.resolve();
            await releaseRow.promise;
        });
        await rowHeld.promise;
        const rotation = new RefreshTokenRotation({
            database,
            inFlight: new Map(),
        });
        const refresh = rotation.run({
            key: { kind: 'project', uuid, purpose: null },
            shareKey: 'row-held',
            readCurrentRefreshToken: async (trx) =>
                (
                    await trx<{ uuid: string; refresh_token: string }>(
                        tableName,
                    )
                        .where({ uuid })
                        .first()
                )?.refresh_token ?? null,
            exchange: async () => 'after',
            persist: async ({ lockedRefreshToken, result, trx }) => {
                await trx.transaction(async (savepoint) => {
                    await savepoint(tableName)
                        .where({ uuid, refresh_token: lockedRefreshToken })
                        .forUpdate()
                        .first();
                    await savepoint(tableName)
                        .where({ uuid, refresh_token: lockedRefreshToken })
                        .update({ refresh_token: result });
                });
            },
        });
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 6_000);
        });
        releaseRow.resolve();
        await holder;
        await refresh;
        expect(await database(tableName).where({ uuid }).first()).toMatchObject(
            { refresh_token: 'after' },
        );
    }, 20_000);

    test('serializes separate in-process maps and rereads the committed rotation', async () => {
        const uuid = randomUUID();
        await database(tableName).insert({ uuid, refresh_token: 'token-1' });
        const first = new RefreshTokenRotation({
            database,
            inFlight: new Map(),
        });
        const second = new RefreshTokenRotation({
            database,
            inFlight: new Map(),
        });
        const entered = deferred();
        const release = deferred();
        const exchangedTokens: string[] = [];
        let activeExchanges = 0;
        let maximumActive = 0;
        const run: RefreshRun<string> = {
            key: { kind: 'project', uuid, purpose: null },
            shareKey: 'test-client',
            readCurrentRefreshToken: async (trx) => {
                const row = await trx<{
                    uuid: string;
                    refresh_token: string;
                }>(tableName)
                    .where({ uuid })
                    .first();
                return row?.refresh_token ?? null;
            },
            exchange: async (token) => {
                activeExchanges += 1;
                maximumActive = Math.max(maximumActive, activeExchanges);
                exchangedTokens.push(token);
                if (token === 'token-1') {
                    entered.resolve();
                    await release.promise;
                }
                activeExchanges -= 1;
                return token === 'token-1' ? 'token-2' : 'token-3';
            },
            persist: async ({ lockedRefreshToken, result, trx }) => {
                await trx.transaction(async (savepoint) => {
                    const updated = await savepoint(tableName)
                        .where({ uuid, refresh_token: lockedRefreshToken })
                        .update({ refresh_token: result });
                    expect(updated).toBe(1);
                });
            },
        };
        const firstPending = first.run(run);
        await entered.promise;
        const secondPending = second.run(run);
        const completed = Promise.all([firstPending, secondPending]);
        try {
            await vi.waitFor(async () => {
                const waiting = await database('pg_locks')
                    .where({ locktype: 'advisory', granted: false })
                    .whereRaw(
                        'classid = ((hashtextextended(?, 0) >> 32) & 4294967295)::oid AND objid = (hashtextextended(?, 0) & 4294967295)::oid',
                        [
                            `oauth-refresh:project:${uuid}:`,
                            `oauth-refresh:project:${uuid}:`,
                        ],
                    )
                    .first();
                expect(waiting).toBeDefined();
            });
            expect(exchangedTokens).toEqual(['token-1']);
        } finally {
            release.resolve();
            await completed;
        }
        expect(maximumActive).toBe(1);
        expect(exchangedTokens).toEqual(['token-1', 'token-2']);
        expect(await database(tableName).where({ uuid }).first()).toMatchObject(
            { refresh_token: 'token-3' },
        );
    });
});
