import {
    JobStatusType,
    SnowflakeAuthenticationType,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { DbtManifestProjectAdapter } from '../../../projectAdapters/dbtManifestProjectAdapter';
import * as projectAdapter from '../../../projectAdapters/projectAdapter';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { UserService } from '../../../services/UserService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { compileCredentialGateFixture } from './compileCredentialGate.mock';
import { dbtManifest } from './multiConnectionCompileFixtures';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
    await migrated.database.schema.createTable('x2_compile_fixture', (table) =>
        table.integer('id'),
    );
    await migrated.database('x2_compile_fixture').insert({ id: 1 });
});
afterAll(async () => migrated?.destroy());
beforeEach(() => {
    vi.spyOn(projectAdapter, 'projectAdapterFromConfig').mockImplementation(
        async (dbt, warehouseClient, cachedWarehouse) =>
            new DbtManifestProjectAdapter({
                parsedManifest: dbtManifest('fixture', [
                    {
                        name:
                            'repository' in dbt &&
                            dbt.repository === 'org/extra'
                                ? 'extra'
                                : 'primary',
                        database: migrated.databaseName,
                        table: 'x2_compile_fixture',
                    },
                ]),
                warehouseClient,
                cachedWarehouse,
                dbtVersion: SupportedDbtVersions.V1_8,
            }),
    );
});
afterEach(() => vi.restoreAllMocks());

const fixture = (
    factory: boolean,
    multi = false,
    credentials?: CreateWarehouseCredentials,
) =>
    compileCredentialGateFixture(
        migrated.database,
        migrated.databaseName,
        factory,
        multi,
        credentials,
    );
const reasons = [
    'revoked',
    'expired',
    'project narrowed',
    'action narrowed',
    'person deactivated',
];
const errorOf = async (fn: () => Promise<unknown>) => {
    try {
        await fn();
    } catch (error) {
        return error;
    }
    throw new Error('Expected refusal');
};
type Internals = {
    prepareCompileAdapter: ProjectService['prepareCompileAdapter'];
    prepareLegacyCompileCredentials: (
        ...args: never[]
    ) => Promise<CreateWarehouseCredentials>;
    getExtraConnectionWarehouseCredentials: (
        ...args: never[]
    ) => Promise<CreateWarehouseCredentials>;
    getDbtTargetPolicy: (...args: never[]) => Promise<unknown>;
};
const internals = (f: Awaited<ReturnType<typeof fixture>>) =>
    f.service as unknown as Internals;

[false, true].forEach((factory) => {
    describe(`credential entry gates (factory ${factory})`, () => {
        test.each(reasons)(
            'primary refuses %s before credential setup reads credentials',
            async (reason) => {
                const f = await fixture(factory, false, {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    account: 'account',
                    user: 'user',
                    database: 'database',
                    warehouse: 'warehouse',
                    schema: 'schema',
                    token: 'access',
                    refreshToken: 'refresh',
                });
                const exchange = vi
                    .spyOn(UserService, 'generateSnowflakeAccessToken')
                    .mockResolvedValue({
                        accessToken: 'next-access',
                        refreshToken: 'next-refresh',
                    });
                const resolver = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'resolveWarehouseCredentials',
                );
                const legacy = vi.spyOn(
                    internals(f),
                    'prepareLegacyCompileCredentials',
                );
                const sensitive = vi.spyOn(
                    f.projects,
                    'getWithSensitiveFields',
                );
                const acquisitionEntry = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'withWarehouseClient',
                );
                const acquire = vi
                    .spyOn(f.service.warehouseClientFactory, 'acquireUnscoped')
                    .mockRejectedValue(
                        new Error('Unexpected credential acquisition'),
                    );
                await f.refuse(reason);
                const before = await f.credentialRows();
                const expected = await f.inConnection(() =>
                    errorOf(() =>
                        f.service.assertAgentConnectionEffect(
                            f.projectUuid,
                            'compileProject',
                        ),
                    ),
                );
                const actual = await f.inConnection(() =>
                    errorOf(() =>
                        internals(f).prepareCompileAdapter(
                            f.projectUuid,
                            f.user,
                        ),
                    ),
                );
                expect.soft(actual).toEqual(expected);
                expect.soft(sensitive).not.toHaveBeenCalled();
                expect.soft(resolver).not.toHaveBeenCalled();
                expect.soft(legacy).not.toHaveBeenCalled();
                expect.soft(exchange).not.toHaveBeenCalled();
                expect.soft(acquisitionEntry).not.toHaveBeenCalled();
                expect.soft(acquire).not.toHaveBeenCalled();
                expect.soft(await f.credentialRows()).toEqual(before);
                expect
                    .soft(projectAdapter.projectAdapterFromConfig)
                    .not.toHaveBeenCalled();
                expect
                    .soft(f.schedulerClient.indexCatalog)
                    .not.toHaveBeenCalled();
                expect(await f.inConnection(() => errorOf(f.run))).toEqual(
                    expected,
                );
                expect(await f.credentialRows()).toEqual(before);
                expect((await f.jobModel.get(f.jobUuid)).jobStatus).toBe(
                    JobStatusType.ERROR,
                );
                expect(
                    await f
                        .database('cached_explore')
                        .where('project_uuid', f.projectUuid),
                ).toEqual([]);
            },
        );

        test('an admitted refresh can persist after revocation but cannot acquire a client or publish', async () => {
            const f = await fixture(factory, false, {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                account: 'account',
                user: 'user',
                database: 'database',
                warehouse: 'warehouse',
                schema: 'schema',
                token: 'access',
                refreshToken: 'refresh',
            });
            const exchange = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockImplementation(async () => {
                    await f.refuse('revoked');
                    return {
                        accessToken: 'next-access',
                        refreshToken: 'next-refresh',
                    };
                });
            const acquisitionEntry = vi.spyOn(
                f.service.warehouseClientFactory,
                'withWarehouseClient',
            );
            const acquire = vi
                .spyOn(f.service.warehouseClientFactory, 'acquireUnscoped')
                .mockRejectedValue(
                    new Error('Unexpected credential acquisition'),
                );
            const actual = await f.inConnection(() => errorOf(f.run));
            const expected = await f.inConnection(() =>
                errorOf(() =>
                    f.service.assertAgentConnectionEffect(
                        f.projectUuid,
                        'compileProject',
                    ),
                ),
            );
            expect(actual).toEqual(expected);
            expect(exchange).toHaveBeenCalledTimes(1);
            expect(
                await f.projects.getWarehouseCredentialsForProjectUncached(
                    f.projectUuid,
                ),
            ).toMatchObject({ refreshToken: 'next-refresh' });
            expect(acquisitionEntry).not.toHaveBeenCalled();
            expect(acquire).not.toHaveBeenCalled();
            expect(f.schedulerClient.indexCatalog).not.toHaveBeenCalled();
            expect((await f.jobModel.get(f.jobUuid)).jobStatus).toBe(
                JobStatusType.ERROR,
            );
            expect(
                await f
                    .database('cached_explore')
                    .where('project_uuid', f.projectUuid),
            ).toEqual([]);
        });

        test.each(reasons)(
            'primary acquisition refuses %s after credential preparation',
            async (reason) => {
                const f = await fixture(factory);
                const policy = internals(f).getDbtTargetPolicy.bind(f.service);
                vi.spyOn(internals(f), 'getDbtTargetPolicy').mockImplementation(
                    async (...args) => {
                        const result = await policy(...args);
                        await f.refuse(reason);
                        return result;
                    },
                );
                const resolver = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'resolveWarehouseCredentials',
                );
                const legacy = vi.spyOn(
                    internals(f),
                    'prepareLegacyCompileCredentials',
                );
                const acquisitionEntry = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'withWarehouseClient',
                );
                const acquire = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'acquireUnscoped',
                );
                const before = await f.credentialRows();
                const actual = await f.inConnection(() => errorOf(f.run));
                const expected = await f.inConnection(() =>
                    errorOf(() =>
                        f.service.assertAgentConnectionEffect(
                            f.projectUuid,
                            'compileProject',
                        ),
                    ),
                );
                expect.soft(actual).toEqual(expected);
                expect
                    .soft(factory ? resolver : legacy)
                    .toHaveBeenCalledTimes(1);
                expect.soft(acquisitionEntry).not.toHaveBeenCalled();
                expect.soft(acquire).not.toHaveBeenCalled();
                expect
                    .soft(projectAdapter.projectAdapterFromConfig)
                    .not.toHaveBeenCalled();
                expect.soft(await f.credentialRows()).toEqual(before);
                expect
                    .soft(f.schedulerClient.indexCatalog)
                    .not.toHaveBeenCalled();
                expect((await f.jobModel.get(f.jobUuid)).jobStatus).toBe(
                    JobStatusType.ERROR,
                );
                expect(
                    await f
                        .database('cached_explore')
                        .where('project_uuid', f.projectUuid),
                ).toEqual([]);
            },
        );

        test.each(reasons)(
            'extra refuses %s after primary stream preparation',
            async (reason) => {
                const f = await fixture(factory, true);
                const prepare =
                    DbtManifestProjectAdapter.prototype.prepareExploreStream;
                const primary = vi
                    .spyOn(
                        DbtManifestProjectAdapter.prototype,
                        'prepareExploreStream',
                    )
                    .mockImplementation(async function compileThenRevoke(
                        this: DbtManifestProjectAdapter,
                        ...args
                    ) {
                        const stream = await prepare.apply(this, args);
                        await f.refuse(reason);
                        return stream;
                    });
                const projectConfig = vi.spyOn(
                    DbtManifestProjectAdapter.prototype,
                    'getLightdashProjectConfig',
                );
                const extra = vi.spyOn(
                    internals(f),
                    'getExtraConnectionWarehouseCredentials',
                );
                const acquisitionEntry = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'withWarehouseClient',
                );
                const acquire = vi.spyOn(
                    f.service.warehouseClientFactory,
                    'acquireUnscoped',
                );
                const before = await f.credentialRows();
                const actual = await f.inConnection(() => errorOf(f.run));
                const expected = await f.inConnection(() =>
                    errorOf(() =>
                        f.service.assertAgentConnectionEffect(
                            f.projectUuid,
                            'compileProject',
                        ),
                    ),
                );
                expect.soft(actual).toEqual(expected);
                expect.soft(primary).toHaveBeenCalledTimes(1);
                expect.soft(projectConfig).toHaveBeenCalledTimes(1);
                expect.soft(extra).not.toHaveBeenCalled();
                expect.soft(acquisitionEntry).toHaveBeenCalledTimes(1);
                expect.soft(acquire).toHaveBeenCalledTimes(1);
                expect.soft(await f.credentialRows()).toEqual(before);
                expect
                    .soft(f.schedulerClient.indexCatalog)
                    .not.toHaveBeenCalled();
                expect((await f.jobModel.get(f.jobUuid)).jobStatus).toBe(
                    JobStatusType.ERROR,
                );
                expect(
                    await f
                        .database('cached_explore')
                        .where('project_uuid', f.projectUuid),
                ).toEqual([]);
            },
        );

        test.each([
            {
                reason: 'revoked',
                label: 'an admitted extra refresh can persist after revocation but cannot acquire the extra client or publish',
            },
            ...reasons.map((reason) => ({
                reason,
                label: `extra acquisition refuses ${reason} during credential load`,
            })),
        ])('$label', async ({ reason }) => {
            const f = await fixture(factory, true);
            if (!f.extraUuid) throw new Error('Missing extra connection');
            const project = await f.warehouseConnectionModel.getProject(
                f.projectUuid,
            );
            await f.warehouseConnectionModel.updateExtraCredentials(
                project,
                f.extraUuid,
                {
                    kind: 'project',
                    credentials: {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        account: 'account',
                        user: 'user',
                        database: 'database',
                        warehouse: 'warehouse',
                        schema: 'schema',
                        token: 'extra-access',
                        refreshToken: 'extra-refresh',
                    },
                },
            );
            const exchange = vi
                .spyOn(UserService, 'generateSnowflakeAccessToken')
                .mockImplementation(async () => {
                    await f.refuse(reason);
                    return {
                        accessToken: 'extra-next-access',
                        refreshToken: 'extra-next-refresh',
                    };
                });
            const acquisitionEntry = vi.spyOn(
                f.service.warehouseClientFactory,
                'withWarehouseClient',
            );
            const originalAcquire =
                f.service.warehouseClientFactory.acquireUnscoped.bind(
                    f.service.warehouseClientFactory,
                );
            const acquire = vi
                .spyOn(f.service.warehouseClientFactory, 'acquireUnscoped')
                .mockImplementation((...args) => {
                    if (args[1].type === WarehouseTypes.SNOWFLAKE)
                        throw new Error('Unexpected extra client acquisition');
                    return originalAcquire(...args);
                });
            const actual = await f.inConnection(() => errorOf(f.run));
            const expected = await f.inConnection(() =>
                errorOf(() =>
                    f.service.assertAgentConnectionEffect(
                        f.projectUuid,
                        'compileProject',
                    ),
                ),
            );
            expect.soft(actual).toEqual(expected);
            expect.soft(exchange).toHaveBeenCalledTimes(1);
            expect
                .soft(
                    await f.warehouseConnectionModel.getCredentials(
                        project,
                        f.extraUuid,
                    ),
                )
                .toMatchObject({
                    refreshToken: 'extra-next-refresh',
                });
            expect
                .soft(
                    acquisitionEntry.mock.calls.map(([ref]) =>
                        ref.kind === 'compile'
                            ? ref.credentials.type
                            : ref.kind,
                    ),
                )
                .toEqual([WarehouseTypes.POSTGRES]);
            expect
                .soft(
                    acquire.mock.calls.map(
                        ([, credentials]) => credentials.type,
                    ),
                )
                .toEqual([WarehouseTypes.POSTGRES]);
            expect.soft(f.schedulerClient.indexCatalog).not.toHaveBeenCalled();
            expect
                .soft((await f.jobModel.get(f.jobUuid)).jobStatus)
                .toBe(JobStatusType.ERROR);
            expect(
                await f
                    .database('cached_explore')
                    .where('project_uuid', f.projectUuid),
            ).toEqual([]);
        });

        test('valid multi compile checks each entry once and retains later checks', async () => {
            const f = await fixture(factory, true);
            const order: string[] = [];
            const check = f.service.assertAgentConnectionEffect.bind(f.service);
            vi.spyOn(
                f.service,
                'assertAgentConnectionEffect',
            ).mockImplementation(async (...args) => {
                order.push('check');
                expect(args).toEqual([f.projectUuid, 'compileProject']);
                return check(...args);
            });
            const sensitive = f.projects.getWithSensitiveFields.bind(
                f.projects,
            );
            vi.spyOn(f.projects, 'getWithSensitiveFields').mockImplementation(
                (...args) => {
                    order.push('sensitive');
                    return sensitive(...args);
                },
            );
            const acquire =
                f.service.warehouseClientFactory.acquireUnscoped.bind(
                    f.service.warehouseClientFactory,
                );
            vi.spyOn(
                f.service.warehouseClientFactory,
                'acquireUnscoped',
            ).mockImplementation((...args) => {
                order.push('acquire');
                return acquire(...args);
            });
            const extra = internals(
                f,
            ).getExtraConnectionWarehouseCredentials.bind(f.service);
            vi.spyOn(
                internals(f),
                'getExtraConnectionWarehouseCredentials',
            ).mockImplementation((...args) => {
                order.push('extra');
                return extra(...args);
            });
            await f.inConnection(f.run);
            expect((await f.jobModel.get(f.jobUuid)).jobStatus).toBe(
                JobStatusType.DONE,
            );
            expect(order.slice(0, 7)).toEqual([
                'sensitive',
                'check',
                'sensitive',
                'check',
                'acquire',
                'check',
                'extra',
            ]);
            expect(order.slice(7, 9)).toEqual(['check', 'acquire']);
            expect(
                order.slice(9).filter((event) => event === 'check').length,
            ).toBeGreaterThan(3);
            expect(f.schedulerClient.indexCatalog).toHaveBeenCalledTimes(1);
        });
    });
});

const recordMethods = (target: object, name: string, calls: string[]) => {
    const methods = new Set([
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(target)),
        ...Object.keys(target),
    ]);
    const object = target as Record<string, (...args: unknown[]) => unknown>;
    for (const method of methods) {
        if (method !== 'constructor' && typeof object[method] === 'function') {
            const original = object[method];
            vi.spyOn(object, method).mockImplementation(function recordCall(
                this: unknown,
                ...args
            ) {
                calls.push(`${name}.${method}`);
                return original.apply(this, args);
            });
        }
    }
};

[false, true].forEach((factory) => {
    test.each(['refresh', 'multi', 'deploy'])(
        `ordinary %s matches the main ordered call and SQL baseline (factory ${factory})`,
        async (operation) => {
            const f = await fixture(factory, operation === 'multi');
            const calls: string[] = [];
            const sql: string[] = [];
            const recordSql = (query: { sql: string }) => sql.push(query.sql);
            for (const [name, target] of Object.entries({
                factory: f.service.warehouseClientFactory,
                project: f.projects,
                connections: f.warehouseConnectionModel,
                sources: f.projectDbtSourcesModel,
                compile: f.warehouseConnectionCompileModel,
                grants: f.executions,
            }))
                recordMethods(target, name, calls);
            for (const method of [
                'prepareLegacyCompileCredentials',
                'getExtraConnectionWarehouseCredentials',
            ] as const) {
                const original = internals(f)[method].bind(f.service);
                vi.spyOn(internals(f), method).mockImplementation((...args) => {
                    calls.push(`service.${method}`);
                    return original(...args);
                });
            }
            const check = vi.spyOn(f.service, 'assertAgentConnectionEffect');
            migrated.database.on('query', recordSql);
            try {
                await (operation === 'deploy' ? f.deploy() : f.run());
            } finally {
                migrated.database.off('query', recordSql);
            }
            expect((await f.jobModel.get(f.jobUuid)).jobStatus).toBe(
                JobStatusType.DONE,
            );
            expect(check).not.toHaveBeenCalled();
            expect(calls).toContain('factory.acquireUnscoped');
            expect(sql.length).toBeGreaterThan(10);
            expect({ calls, sql }).toMatchSnapshot();
        },
    );
});
