import {
    DbtError,
    DbtProjectType,
    JobStepStatusType,
    JobStepType,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtLog,
    type DbtManifest,
} from '@lightdash/common';
import {
    ListedDatabasesPostgresWarehouseClient,
    SshTunnel,
} from '@lightdash/warehouses';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import { JobModel } from '../../models/JobModel/JobModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type CompileGroupPlan } from '../../projectAdapters/CompileGroup';
import { DbtManifestProjectAdapter } from '../../projectAdapters/dbtManifestProjectAdapter';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
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
            ) {}

            connect = vi.fn(async () =>
                'useSshTunnel' in this.credentials &&
                this.credentials.useSshTunnel
                    ? { ...this.credentials, host: '127.0.0.1', port: 43210 }
                    : this.credentials,
            );

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
                        manifest,
                        connection: {
                            warehouseClient: warehouseClientMock,
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
                    return { manifest };
                },
            ) satisfies Parameters<
                typeof compiler.compile
            >[0]['fetchSourceManifest'];
            const result = await compiler.compile({
                projectUuid: 'project',
                context,
                primary: {
                    connection: lease,
                    manifest,
                    dbtProjectDir: undefined,
                    warehouseCredentials: lease.warehouseClient.credentials,
                    cachedWarehouse: {
                        warehouseCatalog: undefined,
                        onWarehouseCatalogChange: vi.fn(),
                    },
                },
                dbtVersion: SupportedDbtVersions.V1_7,
                includeUnboundSources: true,
                fetchSourceManifest,
                loadExtraCredentials: vi.fn(async () => extraCredentials),
            });
            const extraTunnelIndex = vi
                .mocked(SshTunnel)
                .mock.calls.findLastIndex(
                    ([credentials]) => credentials === extraCredentials,
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
