import {
    DbtError,
    DbtProjectType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    InlineErrorType,
    JobStepStatusType,
    JobStepType,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateDuckdbDucklakeCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type DbtLog,
    type DbtManifest,
    type Explore,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    ListedDatabasesPostgresWarehouseClient,
    SshTunnel,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import { JobModel } from '../../models/JobModel/JobModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type CompileGroupPlan } from '../../projectAdapters/CompileGroup';
import * as crossSourceRefs from '../../projectAdapters/crossSourceRefs';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import { createCredentialResolverRegistry } from '../WarehouseClientFactory/credentialResolvers';
import { DatabricksOAuthCredentialResolver } from '../WarehouseClientFactory/resolvers/DatabricksOAuthCredentialResolver';
import { SnowflakeOAuthCredentialResolver } from '../WarehouseClientFactory/resolvers/SnowflakeOAuthCredentialResolver';
import { WarehouseClientFactory } from '../WarehouseClientFactory/WarehouseClientFactory';
import {
    MultiConnectionCompiler,
    type FetchSourceManifest,
} from './MultiConnectionCompiler';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    SshTunnel: vi.fn(
        class MockSshTunnel {
            constructor(
                private readonly credentials: CreateWarehouseCredentials,
            ) {
                this.overrideCredentials = credentials;
            }

            overrideCredentials: CreateWarehouseCredentials;

            connect = vi.fn(async () => {
                this.overrideCredentials =
                    'useSshTunnel' in this.credentials &&
                    this.credentials.useSshTunnel
                        ? {
                              ...this.credentials,
                              host: '127.0.0.1',
                              port: 43210,
                          }
                        : this.credentials;
                return this.overrideCredentials;
            });

            disconnect = vi.fn(async () => undefined);
        },
    ),
}));

const manifest: DbtManifest = {
    nodes: {},
    metrics: {},
    docs: {},
    metadata: {
        adapter_type: 'postgres',
        generated_at: '2026-10-07T00:00:00Z',
        dbt_schema_version: 'https://schemas.getdbt.com/dbt/manifest/v11.json',
    },
};

describe('multi-source compilation diagnostics', () => {
    it('persists the dbt error output when an additional source fails', async () => {
        const log: DbtLog = {
            code: 'E001',
            info: {
                category: 'dbt',
                code: 'E001',
                extra: {},
                invocation_id: 'run-uuid',
                level: 'error',
                log_version: 2,
                msg: 'Compilation Error: macro missing_macro is undefined',
                name: 'CompilationError',
                pid: 1,
                thread_name: 'MainThread',
                ts: '2026-10-07T00:00:00Z',
                type: 'log_line',
            },
        };
        const compiler = new MultiConnectionCompiler({
            projectModel: {
                getDbtSourceIdentity: vi.fn().mockResolvedValue({
                    dbtSourceName: 'primary',
                    dbtSourceUuid: 'primary-source-uuid',
                }),
            },
            projectDbtSourcesModel: {},
            warehouseConnectionCompileModel: {},
        } as unknown as ConstructorParameters<
            typeof MultiConnectionCompiler
        >[0]);
        vi.spyOn(compiler, 'planGroups').mockResolvedValue([
            {
                warehouseConnectionUuid: null,
                connectionName: 'Primary warehouse',
                listedDatabases: {
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
                sources: [
                    {
                        name: 'finance',
                        projectDbtSourceUuid: 'finance-source-uuid',
                        precedence: 1,
                        dbtConnection: { type: DbtProjectType.NONE },
                    },
                ],
            } as unknown as CompileGroupPlan,
        ]);
        const jobModel = new JobModel({
            database: knex({ client: MockClient, dialect: 'pg' }),
        });
        vi.spyOn(jobModel, 'startJobStep').mockResolvedValue();
        const updateStep = vi
            .spyOn(jobModel, 'updateJobStep')
            .mockResolvedValue();
        vi.spyOn(jobModel, 'update').mockResolvedValue();

        await expect(
            jobModel.tryJobStep('job-uuid', JobStepType.COMPILING, () =>
                compiler.compile({
                    concurrency: 1,
                    projectUuid: 'project-uuid',
                    context: connectionContextFromUser(
                        { userUuid: 'user-uuid' },
                        {
                            organizationUuid: 'org-uuid',
                            queryContext: null,
                            purpose: 'compile',
                        },
                    ),
                    primary: {
                        fetchManifest: async () => ({
                            manifest,
                            timings: {
                                gitRefreshMs: null,
                                depsMs: null,
                                manifestMs: 0,
                            },
                        }),
                        connection: {
                            warehouseClient: warehouseClientMock,
                            connectionCredentials:
                                warehouseClientMock.credentials,
                            warehouseCredentials:
                                warehouseClientMock.credentials,
                            deriveClient: vi.fn(() => warehouseClientMock),
                            aiPlan: null,
                            warehouseConnectionUuid: null,
                            connectionRoute: null,
                            credentialKind: WarehouseCredentialKind.COMPILE,
                            tunnelConnectMs: null,
                        },
                        dbtProjectDir: undefined,
                        warehouseCredentials: warehouseClientMock.credentials,
                        cachedWarehouse: {
                            warehouseCatalog: undefined,
                            onWarehouseCatalogChange: vi.fn(),
                        },
                    },
                    dbtVersion: SupportedDbtVersions.V1_7,
                    includeUnboundSources: true,
                    crossSourceRefsEnabled: false,
                    fetchSourceManifest: async () => {
                        throw new DbtError('Failed to run dbt ls', [log]);
                    },
                    loadExtraCredentials: vi.fn(),
                }),
            ),
        ).rejects.toThrow('Failed to load dbt source "finance"');

        expect(updateStep).toHaveBeenCalledWith(
            'job-uuid',
            JobStepStatusType.ERROR,
            JobStepType.COMPILING,
            expect.stringContaining('finance'),
            [log],
        );
    });
});

describe('cross-source compilation', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reports a delayed primary failure without starting siblings when cross-source refs are disabled', async () => {
        const compiler = new MultiConnectionCompiler({
            projectModel: {
                getDbtSourceIdentity: vi.fn().mockResolvedValue({
                    dbtSourceName: 'primary',
                    dbtSourceUuid: 'primary-uuid',
                }),
            },
            projectDbtSourcesModel: {},
            warehouseConnectionCompileModel: {},
        } as unknown as ConstructorParameters<
            typeof MultiConnectionCompiler
        >[0]);
        vi.spyOn(compiler, 'planGroups').mockResolvedValue([
            {
                warehouseConnectionUuid: null,
                connectionName: 'original',
                listedDatabases: {
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
                sources: [
                    {
                        name: 'shared',
                        precedence: 1,
                        projectDbtSourceUuid: 'shared-uuid',
                        dbtConnection: { type: DbtProjectType.NONE },
                    },
                ],
            } as unknown as CompileGroupPlan,
        ]);
        const primaryError = new DbtError('primary failed');
        const fetchManifest = vi.fn(async () => {
            await new Promise<void>((done) => {
                setTimeout(done, 20);
            });
            throw primaryError;
        });
        const fetchSourceManifest = vi
            .fn<FetchSourceManifest>()
            .mockRejectedValue(new DbtError('sibling failed'));
        await expect(
            compiler.compile({
                concurrency: 1,
                projectUuid: 'project-uuid',
                context: connectionContextFromUser(
                    { userUuid: 'user' },
                    {
                        organizationUuid: 'org',
                        queryContext: null,
                        purpose: 'compile',
                    },
                ),
                primary: {
                    fetchManifest,
                    connection: {} as Parameters<
                        typeof compiler.compile
                    >[0]['primary']['connection'],
                    warehouseCredentials: warehouseClientMock.credentials,
                    cachedWarehouse: {
                        warehouseCatalog: undefined,
                        onWarehouseCatalogChange: vi.fn(),
                    },
                    dbtProjectDir: undefined,
                },
                dbtVersion: SupportedDbtVersions.V1_7,
                includeUnboundSources: true,
                crossSourceRefsEnabled: false,
                fetchSourceManifest,
                loadExtraCredentials: vi.fn(),
            }),
        ).rejects.toBe(primaryError);
        expect(fetchManifest).toHaveBeenCalledExactlyOnceWith({
            externalNodes: [],
        });
        expect(fetchSourceManifest).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'prepares sources, reuses fetches and returns warnings with scanned=%s',
        async (scanned) => {
            const resolveManifests = vi.spyOn(
                crossSourceRefs,
                'resolveCrossSourceManifests',
            );
            const log = vi.spyOn(Logger, 'info');
            const compiler = new MultiConnectionCompiler({
                projectModel: {
                    getDbtSourceIdentity: vi.fn().mockResolvedValue({
                        dbtSourceName: 'primary',
                        dbtSourceUuid: 'primary-uuid',
                    }),
                },
                projectDbtSourcesModel: {},
                warehouseConnectionCompileModel: {},
            } as unknown as ConstructorParameters<
                typeof MultiConnectionCompiler
            >[0]);
            vi.spyOn(compiler, 'planGroups').mockResolvedValue([
                {
                    warehouseConnectionUuid: null,
                    connectionName: 'original',
                    listedDatabases: {
                        listAllDatabases: false,
                        additionalDatabases: [],
                    },
                    sources: [
                        {
                            name: 'shared',
                            precedence: 1,
                            projectDbtSourceUuid: 'shared-uuid',
                            dbtConnection: { type: DbtProjectType.NONE },
                        },
                    ],
                } as unknown as CompileGroupPlan,
            ]);
            const prepare = vi
                .spyOn(
                    DbtManifestProjectAdapter.prototype,
                    'prepareExploreStream',
                )
                .mockResolvedValue(
                    (async function* empty() {
                        yield* [];
                    })(),
                );
            const sharedNode = {
                unique_id: 'model.shared.calendar',
                resource_type: 'model',
                name: 'calendar',
                package_name: 'shared',
                path: 'calendar.sql',
                original_file_path: 'models/calendar.sql',
                schema: 'public',
                database: 'db',
                alias: 'calendar',
                columns: {},
                meta: {},
            };
            const upstream = {
                ...manifest,
                metadata: { ...manifest.metadata, project_name: 'shared' },
                nodes: { [sharedNode.unique_id]: sharedNode },
            };
            const primaryManifest = {
                ...manifest,
                metadata: { ...manifest.metadata, project_name: 'analytics' },
                nodes: {
                    'model.analytics.orders': {
                        ...sharedNode,
                        unique_id: 'model.analytics.orders',
                        name: 'orders',
                        package_name: 'analytics',
                        refs: [
                            { name: 'calendar', package: null, version: null },
                        ],
                        depends_on: { nodes: [sharedNode.unique_id] },
                    },
                    [sharedNode.unique_id]: {
                        ...sharedNode,
                        path: '',
                        original_file_path: '',
                    },
                },
            };
            const timings = { gitRefreshMs: null, depsMs: null, manifestMs: 0 };
            const fetchManifest = vi.fn().mockResolvedValue({
                manifest: primaryManifest,
                selectedModelIds: [sharedNode.unique_id],
                timings,
            });
            if (!scanned)
                fetchManifest.mockRejectedValueOnce(
                    new DbtError(
                        "depends on a node named 'calendar' in package or project 'shared' which was not found",
                    ),
                );
            const preparePrimary = vi.fn(async () =>
                scanned
                    ? {
                          projectName: 'analytics',
                          referencedProjects: ['shared'],
                          declaredUpstreams: [],
                      }
                    : null,
            );
            const prepareSourceManifest = vi.fn(async () =>
                scanned
                    ? {
                          projectName: 'shared',
                          referencedProjects: [],
                          declaredUpstreams: [],
                      }
                    : null,
            );
            const fetchSourceManifest = vi
                .fn<FetchSourceManifest>()
                .mockResolvedValue({ manifest: upstream, timings });
            const compilation = await compiler.compile({
                concurrency: 1,
                projectUuid: 'project-uuid',
                context: connectionContextFromUser(
                    { userUuid: 'user' },
                    {
                        organizationUuid: 'org',
                        queryContext: null,
                        purpose: 'compile',
                    },
                ),
                primary: {
                    prepare: preparePrimary,
                    fetchManifest,
                    connection: {
                        deriveClient: vi.fn(() => warehouseClientMock),
                    } as unknown as Parameters<
                        typeof compiler.compile
                    >[0]['primary']['connection'],
                    warehouseCredentials: warehouseClientMock.credentials,
                    cachedWarehouse: {
                        warehouseCatalog: undefined,
                        onWarehouseCatalogChange: vi.fn(),
                    },
                    dbtProjectDir: undefined,
                },
                dbtVersion: SupportedDbtVersions.V1_7,
                includeUnboundSources: true,
                crossSourceRefsEnabled: true,
                fetchSourceManifest,
                prepareSourceManifest,
                loadExtraCredentials: vi.fn(),
            });
            expect(resolveManifests).toHaveBeenCalledWith(
                expect.objectContaining({ concurrency: 1 }),
            );
            expect(log).toHaveBeenCalledWith(
                'dbt.compile.crossSourceRefsResolved',
                expect.objectContaining({
                    projectUuid: 'project-uuid',
                    rounds: 2,
                }),
            );
            expect(fetchManifest).toHaveBeenCalledTimes(scanned ? 1 : 2);
            expect(fetchManifest.mock.calls[scanned ? 0 : 1][0]).toEqual({
                externalNodes: [
                    expect.objectContaining({
                        package_name: 'shared',
                        name: 'calendar',
                    }),
                ],
            });
            expect(fetchSourceManifest).toHaveBeenCalledTimes(1);
            expect(fetchSourceManifest.mock.calls[0][3]).toEqual({
                externalNodes: [],
            });
            expect(prepare).toHaveBeenCalledTimes(1);
            expect(preparePrimary).toHaveBeenCalledTimes(1);
            expect(prepareSourceManifest).toHaveBeenCalledTimes(1);
            expect(compilation.warnings).toEqual([
                "Model \"orders\" in dbt source \"primary\" uses ref('calendar'), which resolved to external model model.shared.calendar from another dbt source. Use ref('shared', 'calendar') to make the cross-source reference explicit.",
            ]);
        },
    );
});

describe('extra connection scope cleanup', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['success', 'test_failure', 'compile_failure'] as const)(
        'releases the extra group tunnel after %s',
        async (outcome) => {
            const primaryCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'primary.internal',
                port: 5432,
                user: 'user',
                password: 'password',
                dbname: 'primary',
                schema: 'public',
            } as const;
            const extraCredentials = {
                ...primaryCredentials,
                host: 'extra.internal',
                dbname: 'extra',
                useSshTunnel: true,
                sshTunnelPrivateKey: 'COPIED-PRIVATE',
            };
            const projectModel = {
                getWarehouseClientFromCredentials: vi.fn<
                    ProjectModel['getWarehouseClientFromCredentials']
                >((credentials) => ({ ...warehouseClientMock, credentials })),
                getDbtSourceIdentity: vi.fn(async () => ({
                    dbtSourceName: 'primary',
                    dbtSourceUuid: 'primary-source',
                })),
            };
            const factory = new WarehouseClientFactory({
                credentialResolvers: createCredentialResolverRegistry({
                    databricksOAuthCredentialResolver:
                        new DatabricksOAuthCredentialResolver({} as never),
                    snowflakeOAuthCredentialResolver:
                        new SnowflakeOAuthCredentialResolver({} as never),
                    lightdashConfig: lightdashConfigMock,
                    userOAuthGrantsModel: { getRefreshToken: vi.fn() },
                    sshKeyPairModel: { find: vi.fn().mockResolvedValue(null) },
                }),
                lightdashConfig: lightdashConfigMock,
                projectModel: projectModel as unknown as ProjectModel,
                featureFlagModel: {},
                aiAccessService: {},
                credentialSource: {},
                logger: Logger,
            } as ConstructorParameters<typeof WarehouseClientFactory>[0]);
            const compiler = new MultiConnectionCompiler({
                projectModel,
                warehouseClientFactory: factory,
                projectDbtSourcesModel: {},
                warehouseConnectionCompileModel: {
                    getCatalogCache: vi.fn(async () => undefined),
                },
            } as unknown as ConstructorParameters<
                typeof MultiConnectionCompiler
            >[0]);
            const source = {
                name: 'extra-source',
                precedence: 1,
                projectDbtSourceUuid: 'extra-source',
                dbtConnection: { type: DbtProjectType.NONE },
            };
            vi.spyOn(compiler, 'planGroups').mockResolvedValue([
                {
                    warehouseConnectionUuid: null,
                    connectionName: 'Primary',
                    listedDatabases: {
                        listAllDatabases: false,
                        additionalDatabases: [],
                    },
                    sources: [],
                },
                {
                    warehouseConnectionUuid: 'extra-connection',
                    connectionName: 'Extra',
                    listedDatabases: {
                        listAllDatabases: false,
                        additionalDatabases: ['listed'],
                    },
                    sources: [source],
                },
            ] as CompileGroupPlan[]);
            const test = vi
                .spyOn(ListedDatabasesPostgresWarehouseClient.prototype, 'test')
                .mockImplementation(async () => {
                    if (outcome === 'test_failure')
                        throw new Error('test failed');
                });
            vi.spyOn(
                DbtManifestProjectAdapter.prototype,
                'prepareExploreStream',
            ).mockImplementation(async () =>
                (async function* empty() {
                    yield* [];
                })(),
            );
            const compile = vi
                .spyOn(
                    DbtManifestProjectAdapter.prototype,
                    'compileAllExplores',
                )
                .mockImplementation(async () => {
                    if (outcome === 'compile_failure')
                        throw new Error('compile failed');
                    return [];
                });
            const context = connectionContextFromUser(
                { userUuid: 'user' },
                {
                    organizationUuid: 'org',
                    queryContext: null,
                    purpose: 'compile',
                },
            );
            const lease = await factory.acquireWarehouseConnection(
                {
                    kind: 'compile',
                    projectUuid: 'project',
                    credentials: primaryCredentials,
                },
                context,
            );
            const fetchSourceManifest = vi.fn<FetchSourceManifest>(
                async (_source, credentials, connection) => {
                    expect(connection.warehouseClient.credentials).toEqual(
                        credentials,
                    );
                    expect(
                        connection.deriveClient({
                            ...extraCredentials,
                            host: '127.0.0.1',
                            port: 43210,
                            schema: 'source_schema',
                        }).credentials,
                    ).toMatchObject({ host: '127.0.0.1', port: 43210 });
                    return {
                        manifest,
                        timings: {
                            gitRefreshMs: null,
                            depsMs: null,
                            manifestMs: 0,
                        },
                    };
                },
            ) satisfies Parameters<
                typeof compiler.compile
            >[0]['fetchSourceManifest'];
            const result = await compiler.compile({
                concurrency: 1,
                projectUuid: 'project',
                context,
                primary: {
                    connection: lease,
                    fetchManifest: async () => ({
                        manifest,
                        timings: {
                            gitRefreshMs: null,
                            depsMs: null,
                            manifestMs: 0,
                        },
                    }),
                    dbtProjectDir: undefined,
                    warehouseCredentials: lease.connectionCredentials,
                    cachedWarehouse: {
                        warehouseCatalog: undefined,
                        onWarehouseCatalogChange: vi.fn(),
                    },
                },
                dbtVersion: SupportedDbtVersions.V1_7,
                includeUnboundSources: true,
                crossSourceRefsEnabled: false,
                fetchSourceManifest,
                loadExtraCredentials: vi.fn(async () => extraCredentials),
            });
            const extraTunnelIndex = vi
                .mocked(SshTunnel)
                .mock.calls.findLastIndex(
                    ([credentials]) =>
                        credentials.type === WarehouseTypes.POSTGRES &&
                        credentials.host === extraCredentials.host &&
                        'sshTunnelPrivateKey' in credentials &&
                        credentials.sshTunnelPrivateKey ===
                            extraCredentials.sshTunnelPrivateKey,
                );
            expect(extraTunnelIndex).toBeGreaterThanOrEqual(0);
            const extraTunnel =
                vi.mocked(SshTunnel).mock.results[extraTunnelIndex].value;
            expect(extraTunnel.disconnect).toHaveBeenCalledOnce();
            expect(test).toHaveBeenCalledOnce();
            if (outcome === 'test_failure') {
                expect(compile).not.toHaveBeenCalled();
                expect(fetchSourceManifest).not.toHaveBeenCalled();
            } else {
                expect(compile).toHaveBeenCalledOnce();
                expect(fetchSourceManifest).toHaveBeenCalledOnce();
            }
            expect(result.carry).toEqual({
                kind: 'connections',
                warehouseConnectionUuids:
                    outcome === 'success' ? [] : ['extra-connection'],
            });
            await lease.release();
        },
    );
});

describe('Snowflake extra compile credentials', () => {
    afterEach(() => vi.restoreAllMocks());

    it('fetches the bound dbt source and catalog with the extra connection', async () => {
        const credentials: CreateSnowflakeCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'example-account',
            user: 'user',
            password: 'password',
            database: 'ANALYTICS',
            warehouse: 'REPORTING_WH',
            schema: 'PUBLIC',
        };
        const projectModel = {
            getWarehouseClientFromCredentials: vi.fn(
                (saved: CreateWarehouseCredentials) => ({
                    ...warehouseClientMock,
                    credentials: saved,
                }),
            ),
        };
        const factory = new WarehouseClientFactory({
            credentialResolvers: createCredentialResolverRegistry({
                databricksOAuthCredentialResolver:
                    new DatabricksOAuthCredentialResolver({} as never),
                snowflakeOAuthCredentialResolver:
                    new SnowflakeOAuthCredentialResolver({} as never),
                lightdashConfig: lightdashConfigMock,
                userOAuthGrantsModel: { getRefreshToken: vi.fn() },
                sshKeyPairModel: { find: vi.fn().mockResolvedValue(null) },
            }),
            lightdashConfig: lightdashConfigMock,
            projectModel,
            featureFlagModel: {},
            aiAccessService: {},
            credentialSource: {},
            logger: Logger,
        } as unknown as ConstructorParameters<
            typeof WarehouseClientFactory
        >[0]);
        const getCatalogCache = vi.fn(async () => undefined);
        const compiler = new MultiConnectionCompiler({
            projectModel,
            warehouseClientFactory: factory,
            projectDbtSourcesModel: {},
            warehouseConnectionCompileModel: { getCatalogCache },
        } as unknown as ConstructorParameters<
            typeof MultiConnectionCompiler
        >[0]);
        vi.spyOn(
            DbtManifestProjectAdapter.prototype,
            'compileAllExplores',
        ).mockResolvedValue([]);
        const fetchSourceManifest = vi.fn<FetchSourceManifest>(
            async (_source, sourceCredentials, connection) => {
                expect(sourceCredentials).toMatchObject(credentials);
                expect(connection.warehouseClient.credentials).toMatchObject(
                    credentials,
                );
                return {
                    manifest,
                    timings: {
                        gitRefreshMs: null,
                        depsMs: null,
                        manifestMs: 0,
                    },
                };
            },
        );
        const loadExtraCredentials = vi.fn(async () => credentials);
        const resolveManifests = vi.spyOn(
            crossSourceRefs,
            'resolveCrossSourceManifests',
        );
        const internals = compiler as unknown as {
            compileExtraGroup: (args: {
                projectUuid: string;
                context: ReturnType<typeof connectionContextFromUser>;
                plan: CompileGroupPlan & { warehouseConnectionUuid: string };
                dbtVersion: SupportedDbtVersions;
                fetchSourceManifest: FetchSourceManifest;
                crossSourceRefsEnabled: boolean;
                concurrency: number;
                loadExtraCredentials: typeof loadExtraCredentials;
                trackingParams: undefined;
                warnings: string[];
            }) => Promise<unknown>;
        };
        await internals.compileExtraGroup({
            concurrency: 1,
            crossSourceRefsEnabled: true,
            projectUuid: 'project-uuid',
            context: connectionContextFromUser(
                { userUuid: 'user' },
                {
                    organizationUuid: 'org',
                    queryContext: null,
                    purpose: 'compile',
                },
            ),
            plan: {
                warehouseConnectionUuid: 'extra-uuid',
                connectionName: 'Reporting',
                listedDatabases: {
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
                sources: [
                    {
                        name: 'source',
                        precedence: 1,
                        projectDbtSourceUuid: 'source-uuid',
                        dbtConnection: { type: DbtProjectType.NONE },
                    },
                ],
            } as unknown as CompileGroupPlan & {
                warehouseConnectionUuid: string;
            },
            dbtVersion: SupportedDbtVersions.V1_7,
            fetchSourceManifest,
            loadExtraCredentials,
            trackingParams: undefined,
            warnings: [],
        });
        expect(resolveManifests).toHaveBeenCalledWith(
            expect.objectContaining({ concurrency: 1 }),
        );
        expect(loadExtraCredentials).toHaveBeenCalledWith('extra-uuid');
        expect(getCatalogCache).toHaveBeenCalledWith(
            'project-uuid',
            'extra-uuid',
        );
        expect(fetchSourceManifest).toHaveBeenCalledOnce();
    });
});

describe('DuckLake extra compile credentials', () => {
    afterEach(() => vi.restoreAllMocks());

    it('passes original DuckLake credentials to an extra source manifest fetch', async () => {
        const credentials: CreateDuckdbDucklakeCredentials = {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.DUCKLAKE,
            catalogAlias: 'lake',
            schema: 'public',
            catalog: {
                type: DucklakeCatalogType.SQLITE,
                path: '/tmp/test-lake-catalog.sqlite',
            },
            dataPath: {
                type: DucklakeDataPathType.LOCAL,
                path: '/tmp/test-lake-data',
            },
        };
        const projectModel = {
            getWarehouseClientFromCredentials: vi.fn(
                warehouseClientFromCredentials,
            ),
        };
        const factory = new WarehouseClientFactory({
            credentialResolvers: createCredentialResolverRegistry({
                databricksOAuthCredentialResolver:
                    new DatabricksOAuthCredentialResolver({} as never),
                snowflakeOAuthCredentialResolver:
                    new SnowflakeOAuthCredentialResolver({} as never),
                lightdashConfig: lightdashConfigMock,
                userOAuthGrantsModel: { getRefreshToken: vi.fn() },
                sshKeyPairModel: { find: vi.fn().mockResolvedValue(null) },
            }),
            lightdashConfig: lightdashConfigMock,
            projectModel,
            featureFlagModel: {},
            aiAccessService: {},
            credentialSource: {},
            logger: Logger,
        } as unknown as ConstructorParameters<
            typeof WarehouseClientFactory
        >[0]);
        const compiler = new MultiConnectionCompiler({
            projectModel,
            warehouseClientFactory: factory,
            projectDbtSourcesModel: {},
            warehouseConnectionCompileModel: {
                getCatalogCache: vi.fn(async () => undefined),
            },
        } as unknown as ConstructorParameters<
            typeof MultiConnectionCompiler
        >[0]);
        vi.spyOn(DuckdbWarehouseClient.prototype, 'test').mockResolvedValue(
            undefined,
        );
        vi.spyOn(
            DbtManifestProjectAdapter.prototype,
            'compileAllExplores',
        ).mockResolvedValue([]);
        const fetchSourceManifest = vi.fn<FetchSourceManifest>(async () => ({
            manifest,
            timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
        }));
        const resolveManifests = vi.spyOn(
            crossSourceRefs,
            'resolveCrossSourceManifests',
        );
        const internals = compiler as unknown as {
            compileExtraGroup: (args: {
                projectUuid: string;
                context: ReturnType<typeof connectionContextFromUser>;
                plan: CompileGroupPlan & { warehouseConnectionUuid: string };
                dbtVersion: SupportedDbtVersions;
                fetchSourceManifest: FetchSourceManifest;
                crossSourceRefsEnabled: boolean;
                concurrency: number;
                loadExtraCredentials: () => Promise<CreateWarehouseCredentials>;
                trackingParams: undefined;
                warnings: string[];
            }) => Promise<unknown>;
        };
        await internals.compileExtraGroup({
            concurrency: 1,
            crossSourceRefsEnabled: true,
            projectUuid: 'project-uuid',
            context: connectionContextFromUser(
                { userUuid: 'user' },
                {
                    organizationUuid: 'org',
                    queryContext: null,
                    purpose: 'compile',
                },
            ),
            plan: {
                warehouseConnectionUuid: 'extra',
                connectionName: 'Extra',
                listedDatabases: {
                    listAllDatabases: false,
                    additionalDatabases: [],
                },
                sources: [
                    {
                        name: 'source',
                        precedence: 1,
                        projectDbtSourceUuid: 'source-uuid',
                        dbtConnection: { type: DbtProjectType.NONE },
                    },
                ],
            } as unknown as CompileGroupPlan & {
                warehouseConnectionUuid: string;
            },
            dbtVersion: SupportedDbtVersions.V1_7,
            fetchSourceManifest,
            loadExtraCredentials: async () => credentials,
            trackingParams: undefined,
            warnings: [],
        });
        expect(resolveManifests).toHaveBeenCalledWith(
            expect.objectContaining({ concurrency: 1 }),
        );
        expect(fetchSourceManifest.mock.calls[0][1]).toEqual(credentials);
        expect(
            fetchSourceManifest.mock.calls[0][2].warehouseClient.credentials,
        ).toMatchObject({
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            token: '',
        });
    });
});

describe('cross-connection join warnings', () => {
    it.each(['customers', 'missing_model'])(
        'explains a skipped join to %s',
        async (table) => {
            const warning = {
                type: InlineErrorType.MISSING_TABLE,
                message: `Join "customer_alias" to table "${table}" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.`,
            };
            const postgresExplore: Explore = {
                targetDatabase: SupportedDbtAdapter.POSTGRES,
                name: 'customers',
                tables: {},
                joinedTables: [],
                baseTable: 'customers',
                label: 'Customers',
                tags: [],
            };
            const trinoExplore: Explore = {
                ...postgresExplore,
                targetDatabase: SupportedDbtAdapter.TRINO,
                name: 'orders',
                baseTable: 'orders',
                warnings: [warning],
            };
            const internals = MultiConnectionCompiler as unknown as {
                groupExplores: (
                    original: AsyncIterable<Explore>,
                    sources: Map<string, string>,
                    originalName: string,
                    extras: {
                        plan: { connectionName: string };
                        explores: Explore[];
                        modelNames: string[];
                    }[],
                    originalModels: string[],
                ) => AsyncIterable<Explore>;
            };
            const results: Explore[] = [];
            for await (const explore of internals.groupExplores(
                (async function* original() {
                    yield postgresExplore;
                })(),
                new Map(),
                'Postgres (jaffle)',
                [
                    {
                        plan: { connectionName: 'Trino (tpch)' },
                        explores: [trinoExplore],
                        modelNames: ['orders'],
                    },
                ],
                ['customers'],
            ))
                results.push(explore);
            expect(results).toHaveLength(2);
            expect(results[1].warnings).toEqual([
                table === 'customers'
                    ? {
                          type: InlineErrorType.MISSING_TABLE,
                          message:
                              'Join "customer_alias" was skipped: model "customers" is on connection "Postgres (jaffle)", and this explore runs on connection "Trino (tpch)". Joins across connections are not supported.',
                      }
                    : warning,
            ]);
        },
    );
});
