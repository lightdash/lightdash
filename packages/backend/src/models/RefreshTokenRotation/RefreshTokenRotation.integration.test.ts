import { type Knex } from 'knex';
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
            readCurrentRefreshToken: async () => {
                const row = await database<{
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
            persist: async ({ lockedRefreshToken, result }) => {
                await database.transaction(async (trx) => {
                    const updated = await trx(tableName)
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
