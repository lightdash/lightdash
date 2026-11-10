import {
    DatabricksAuthenticationType,
    WarehouseTypes,
    type CreateDatabricksCredentials,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { getTestContext } from '../../vitest.setup.integration';
import { ProjectModel } from '../ProjectModel/ProjectModel';
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
        const writeStarted = deferred();
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
                    writeStarted.resolve();
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
        try {
            await writeStarted.promise;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 6_000);
            });
        } finally {
            releaseRow.resolve();
            await holder;
        }
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

const databricksCredentials = (
    authenticationType: DatabricksAuthenticationType,
): CreateDatabricksCredentials => ({
    type: WarehouseTypes.DATABRICKS,
    authenticationType,
    serverHostName: 'workspace.example.com',
    httpPath: '/sql/warehouse',
    database: 'schema',
    oauthClientId: 'cli-client',
    refreshToken: 'token-1',
});

describe.each([
    DatabricksAuthenticationType.OAUTH_U2M,
    DatabricksAuthenticationType.OAUTH_M2M,
])('Databricks %s model-backed rotation (PostgreSQL)', (authenticationType) => {
    let database: Knex;
    let encryptionUtil: EncryptionUtil;
    const projectUuids: string[] = [];

    beforeAll(() => {
        database = getTestContext().db;
        encryptionUtil = new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        });
    });

    afterAll(async () => {
        const projects = database('projects')
            .select('project_id')
            .whereIn('project_uuid', projectUuids);
        await database('warehouse_credentials')
            .whereIn('project_id', projects)
            .delete();
        await database('projects')
            .whereIn('project_uuid', projectUuids)
            .delete();
    });

    const fixture = async (db = database) => {
        const organization = await db('organizations')
            .select('organization_id')
            .first();
        if (!organization) throw new Error('Missing seeded organization');
        const [project] = await db('projects')
            .insert({
                name: 'Databricks rotation test',
                organization_id: organization.organization_id,
            } as never)
            .returning(['project_id', 'project_uuid']);
        projectUuids.push(project.project_uuid);
        const credentials = databricksCredentials(authenticationType);
        await db('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: WarehouseTypes.DATABRICKS,
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(credentials),
            ),
        });
        const model = new ProjectModel({
            database: db,
            encryptionUtil,
            lightdashConfig: lightdashConfigMock,
        });
        const read = async (trx?: Knex) =>
            model.getOwnWarehouseCredentialsForProject(
                project.project_uuid,
                trx,
            ) as Promise<CreateDatabricksCredentials>;
        const run: RefreshRun<string> = {
            key: { kind: 'project', uuid: project.project_uuid, purpose: null },
            shareKey: `databricks:${authenticationType}`,
            readCurrentRefreshToken: async (trx) =>
                (await read(trx)).refreshToken ?? null,
            exchange: vi.fn(async () => 'token-2'),
            persist: async ({ lockedRefreshToken, result, trx }) => {
                expect(
                    await model.rotateRefreshToken(
                        project.project_uuid,
                        lockedRefreshToken,
                        result,
                        trx,
                    ),
                ).toBe(true);
            },
        };
        return { project, credentials, read, run };
    };

    test('uses the held transaction for the model reread and guarded write with a pool of one', async () => {
        const single = knex({
            ...database.client.config,
            pool: { min: 0, max: 1 },
            acquireConnectionTimeout: 500,
        });
        try {
            const f = await fixture(single);
            await new RefreshTokenRotation({
                database: single,
                inFlight: new Map(),
            }).run(f.run);
            expect(f.run.exchange).toHaveBeenCalledExactlyOnceWith('token-1');
            expect(await f.read()).toEqual({
                ...f.credentials,
                refreshToken: 'token-2',
            });
        } finally {
            await single.destroy();
        }
    });

    test('keeps the rotated token when the model guarded write waits beyond five seconds', async () => {
        const f = await fixture();
        const rowHeld = deferred();
        const releaseRow = deferred();
        const holder = database.transaction(async (trx) => {
            await trx('warehouse_credentials')
                .where('project_id', f.project.project_id)
                .forUpdate()
                .first();
            rowHeld.resolve();
            await releaseRow.promise;
        });
        await rowHeld.promise;
        const writeStarted = deferred();
        let finished = false;
        const refresh = new RefreshTokenRotation({
            database,
            inFlight: new Map(),
        }).run({
            ...f.run,
            persist: async (args) => {
                writeStarted.resolve();
                await f.run.persist(args);
            },
        });
        const settled = refresh.then(
            () => {
                finished = true;
            },
            () => {
                finished = true;
            },
        );
        try {
            await writeStarted.promise;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 6_000);
            });
            expect(finished).toBe(false);
        } finally {
            releaseRow.resolve();
            await holder;
            await settled;
        }
        await refresh;
        expect(f.run.exchange).toHaveBeenCalledExactlyOnceWith('token-1');
        expect(await f.read()).toEqual({
            ...f.credentials,
            refreshToken: 'token-2',
        });
    }, 20_000);

    test('separate coordinators exchange the old then committed rotated token with concurrency one', async () => {
        const f = await fixture();
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
        const tokens: string[] = [];
        let active = 0;
        let maximumActive = 0;
        const run: RefreshRun<string> = {
            ...f.run,
            exchange: async (token) => {
                active += 1;
                maximumActive = Math.max(maximumActive, active);
                tokens.push(token);
                if (token === 'token-1') {
                    entered.resolve();
                    await release.promise;
                }
                active -= 1;
                return token === 'token-1' ? 'token-2' : 'token-3';
            },
        };
        const firstPending = first.run(run);
        await entered.promise;
        const secondPending = second.run(run);
        const completed = Promise.allSettled([firstPending, secondPending]);
        try {
            const key = `oauth-refresh:project:${f.project.project_uuid}:`;
            await vi.waitFor(async () => {
                const waiting = await database('pg_locks')
                    .where({ locktype: 'advisory', granted: false })
                    .whereRaw(
                        'classid = ((hashtextextended(?, 0) >> 32) & 4294967295)::oid AND objid = (hashtextextended(?, 0) & 4294967295)::oid',
                        [key, key],
                    )
                    .first();
                expect(waiting).toBeDefined();
            });
            expect(tokens).toEqual(['token-1']);
        } finally {
            release.resolve();
            await completed;
        }
        await Promise.all([firstPending, secondPending]);
        expect(maximumActive).toBe(1);
        expect(tokens).toEqual(['token-1', 'token-2']);
        expect(await f.read()).toEqual({
            ...f.credentials,
            refreshToken: 'token-3',
        });
    });
});
