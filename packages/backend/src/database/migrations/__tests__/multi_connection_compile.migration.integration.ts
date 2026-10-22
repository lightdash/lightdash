import { Ability } from '@casl/ability';
import {
    calculateCompilationReport,
    ConflictError,
    convertExplores,
    DbtError,
    DEFAULT_SPOTLIGHT_CONFIG,
    DeploySessionStatus,
    DimensionType,
    ExploreType,
    FeatureFlags,
    getCatalogMissingEntries,
    getModelsFromManifest,
    isExploreError,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    ParameterError,
    ProjectType,
    RequestMethod,
    SingleConnectionProjectError,
    SupportedDbtAdapter,
    SupportedDbtVersions,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DbtProjectConfig,
    type DbtRawModelNode,
    type Explore,
    type ExploreError,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import {
    ListedDatabasesPostgresWarehouseClient,
    warehouseClientFromCredentials,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import Logger from '../../../logging/logger';
import { CatalogModel } from '../../../models/CatalogModel/CatalogModel';
import { DbtSourceRefCatalogModel } from '../../../models/DbtSourceRefCatalogModel';
import { DeploySessionModel } from '../../../models/DeploySessionModel';
import { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { JobModel } from '../../../models/JobModel/JobModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../../models/ProjectCompileLogModel';
import { ProjectCompileModel } from '../../../models/ProjectCompileModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { rewriteAllocatedExplore } from '../../../models/ProjectModel/allocatedExploreReferences';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../../models/ProjectParametersModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type CompilableDbtSource } from '../../../projectAdapters/CompileGroup';
import { DbtManifestProjectAdapter } from '../../../projectAdapters/dbtManifestProjectAdapter';
import {
    armCompileShutdown,
    CompileInterruptedError,
    compileShutdown,
    disarmCompileShutdown,
    type CompileShutdownContext,
} from '../../../scheduler/compileShutdown';
import { SchedulerWorker } from '../../../scheduler/SchedulerWorker';
import { DeployService } from '../../../services/DeployService';
import {
    MultiConnectionCompiler,
    withConnectionWarnings,
} from '../../../services/MultiConnectionCompiler/MultiConnectionCompiler';
import { ProjectDbtSourcesService } from '../../../services/ProjectDbtSourcesService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../../../services/WarehouseClientFactory/ConnectionContext';
import {
    type ScopedWarehouseConnection,
    type WarehouseClientFactory,
    type WarehouseConnectionLease,
} from '../../../services/WarehouseClientFactory/WarehouseClientFactory';
import { WarehouseConnectionBindingService } from '../../../services/WarehouseConnectionBindingService/WarehouseConnectionBindingService';
import { getAdminDatabase } from '../../../testing/migratedDatabase';
import {
    type DbtManifestFetchOptions,
    type DbtManifestFetchResult,
} from '../../../types';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';
import {
    dbtManifest,
    githubDbtConnection,
    postgresWarehouse,
    type FixtureModel,
} from './multiConnectionCompileFixtures';

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    setTag: vi.fn(),
}));

const SECRET = 'multi-connection-compile-test-secret';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const ORIGINAL_DB = `pr7_original_${suffix}`;
const EXTRA_DB = `pr7_extra_${suffix}`;
const LISTED_DB = `pr7_listed_${suffix}`;
const MISSING_DB = `pr7_missing_${suffix}`;
const DEAD_PORT = 1;

type CachedExploreRow = {
    name: string;
    table_names: string[];
    explore: Explore | ExploreError;
    warehouse_connection_uuid: string | null;
};

type Fixture = {
    projectUuid: string;
    originalConnectionUuid: string;
    extraConnectionUuid: string;
    sourceUuids: Record<string, string>;
};

type CompileCredentials = {
    warehouseClientFactory: WarehouseClientFactory;
    getExtraConnectionWarehouseCredentials: (args: {
        projectUuid: string;
        warehouseConnectionUuid: string;
        userId: string;
        isRegisteredUser: boolean;
        purpose: 'compile';
    }) => Promise<
        CreateWarehouseCredentials & {
            userWarehouseCredentialsUuid: string | undefined;
        }
    >;
};

describe('Multi-connection compile on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let admin: Knex;
    let encryptionUtil: EncryptionUtil;
    let projectModel: ProjectModel;
    let projectDbtSourcesModel: ProjectDbtSourcesModel;
    let warehouseConnectionModel: WarehouseConnectionModel;
    let warehouseConnectionCompileModel: WarehouseConnectionCompileModel;
    let compiler: MultiConnectionCompiler;
    let compileCredentials: CompileCredentials;

    const loadExtraCredentials =
        (projectUuid: string) => async (warehouseConnectionUuid: string) => {
            const { userWarehouseCredentialsUuid, ...credentials } =
                await compileCredentials.getExtraConnectionWarehouseCredentials(
                    {
                        projectUuid,
                        warehouseConnectionUuid,
                        userId: defaultSessionUser.userUuid,
                        isRegisteredUser: true,
                        purpose: 'compile',
                    },
                );
            return credentials;
        };

    const primaryModels: FixtureModel[] = [
        { name: 'orders', database: ORIGINAL_DB, table: 'orders' },
        { name: 'customers', database: ORIGINAL_DB, table: 'customers' },
    ];
    const sourceManifests: Record<string, DbtManifest> = {};
    const fetchedWith: { source: string; dbname: string }[] = [];

    const fetchSourceManifest = async (
        source: CompilableDbtSource,
        credentials: CreateWarehouseCredentials,
    ) => {
        fetchedWith.push({
            source: source.name,
            dbname: 'dbname' in credentials ? String(credentials.dbname) : '',
        });
        return {
            manifest: sourceManifests[source.name],
            timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
        };
    };

    const createWarehouseDatabase = async (name: string, tables: string[]) => {
        await admin.raw('CREATE DATABASE ??', [name]);
        const warehouse = knex({
            client: 'pg',
            connection: { ...postgresWarehouse(name), database: name },
        });
        try {
            await Promise.all(
                tables.map((table) =>
                    warehouse.raw(
                        `CREATE TABLE ?? (id integer, amount numeric)`,
                        [table],
                    ),
                ),
            );
        } finally {
            await warehouse.destroy();
        }
    };

    const createProject = async (
        extraCredentials: CreateWarehouseCredentials = postgresWarehouse(
            EXTRA_DB,
        ),
        listing: {
            listAllDatabases: boolean;
            additionalDatabases: string[];
        } = {
            listAllDatabases: false,
            additionalDatabases: [],
        },
        withSources = true,
        projectType = ProjectType.DEFAULT,
        upstreamProjectUuid?: string,
    ): Promise<Fixture> => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Compile test' })
            .returning(['organization_id', 'organization_uuid']);
        const [project] = await database('projects')
            .insert({
                name: 'Compile project',
                project_type: projectType,
                copied_from_project_uuid: upstreamProjectUuid,
                organization_id: organization.organization_id,
                connection_mode: 'multi',
                dbt_connection_type: 'github',
                dbt_connection: encryptionUtil.encrypt(
                    JSON.stringify(githubDbtConnection('org/primary')),
                ),
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: 'postgres',
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(postgresWarehouse(ORIGINAL_DB)),
            ),
        } as never);
        const [original] = await database('warehouse_connections')
            .insert({
                project_uuid: project.project_uuid,
                is_original: true,
                name: 'Original',
            })
            .returning('warehouse_connection_uuid');
        const connectionProject = await warehouseConnectionModel.getProject(
            project.project_uuid,
        );
        const extra = await warehouseConnectionModel.createExtra(
            connectionProject,
            {
                name: 'Finance warehouse',
                warehouseType: extraCredentials.type,
                source: { kind: 'project', credentials: extraCredentials },
                ...listing,
                createdByUserUuid: null as never,
            },
        );
        const sourceUuids: Record<string, string> = {};
        await (withSources ? ['marketing', 'finance'] : []).reduce(
            async (previous, name, index) => {
                await previous;
                const created = await projectDbtSourcesModel.createSource(
                    project.project_uuid,
                    {
                        name,
                        isPrimary: false,
                        precedence: index + 1,
                        dbtConnection: githubDbtConnection(`org/${name}`),
                        warehouseLocation: { database: null, schema: null },
                    },
                );
                sourceUuids[name] = created.projectDbtSourceUuid;
            },
            Promise.resolve(),
        );
        if (withSources) {
            await warehouseConnectionCompileModel.bindDbtSource(
                project.project_uuid,
                sourceUuids.finance,
                extra.warehouseConnectionUuid,
            );
        }
        return {
            projectUuid: project.project_uuid,
            originalConnectionUuid: original.warehouse_connection_uuid,
            extraConnectionUuid: extra.warehouseConnectionUuid,
            sourceUuids,
        };
    };

    const bind = async (
        fixture: Fixture,
        source: string,
        warehouseConnectionUuid: string | null,
    ) =>
        warehouseConnectionCompileModel.bindDbtSource(
            fixture.projectUuid,
            fixture.sourceUuids[source],
            warehouseConnectionUuid,
        );

    const compile = async (
        fixture: Fixture,
        primary: FixtureModel[] = primaryModels,
        originalCredentials: CreateWarehouseCredentials = postgresWarehouse(
            ORIGINAL_DB,
        ),
        includeUnboundSources = true,
        failure: {
            sources: string[];
            phase: 'prepare' | 'manifest';
            crossSourceRefs: boolean;
            onWarning?: (warning: string) => Promise<void>;
        } | null = null,
    ) => {
        const { organizationUuid } = await projectModel.getSummary(
            fixture.projectUuid,
        );
        const context = connectionContextFromUser(
            { userUuid: 'compile-user' },
            { organizationUuid, queryContext: null, purpose: 'compile' },
        );
        return compileCredentials.warehouseClientFactory.withWarehouseClient(
            {
                kind: 'compile',
                projectUuid: fixture.projectUuid,
                credentials: originalCredentials,
            },
            context,
            async (connection) => {
                const compilation = await compiler.compile({
                    concurrency: 1,
                    context,
                    projectUuid: fixture.projectUuid,
                    primary: {
                        connection,
                        fetchManifest: async () => {
                            if (failure?.sources.includes('primary'))
                                throw new DbtError('Primary parse failed');
                            return {
                                manifest: dbtManifest('primary', primary),
                                timings: {
                                    gitRefreshMs: null,
                                    depsMs: null,
                                    manifestMs: 0,
                                },
                            };
                        },
                        dbtProjectDir: undefined,
                        warehouseCredentials: originalCredentials,
                        cachedWarehouse: {
                            warehouseCatalog:
                                await projectModel.getWarehouseFromCache(
                                    fixture.projectUuid,
                                ),
                            onWarehouseCatalogChange: async (catalog) => {
                                await projectModel.saveWarehouseToCache(
                                    fixture.projectUuid,
                                    catalog,
                                );
                            },
                        },
                    },
                    dbtVersion: SupportedDbtVersions.V1_8,
                    includeUnboundSources,
                    crossSourceRefsEnabled: failure?.crossSourceRefs ?? false,
                    mixedWarehouseConnectionsEnabled: false,
                    onSourceWarning: failure?.onWarning,
                    prepareSourceManifest: async (source) => {
                        if (
                            failure?.phase === 'prepare' &&
                            failure.sources.includes(source.name)
                        )
                            throw new Error('Repository clone failed');
                        return null;
                    },
                    fetchSourceManifest: async (...args) => {
                        if (
                            failure?.phase === 'manifest' &&
                            failure.sources.includes(args[0].name)
                        )
                            throw new DbtError('Source parse failed');
                        return fetchSourceManifest(args[0], args[1]);
                    },
                    loadExtraCredentials: loadExtraCredentials(
                        fixture.projectUuid,
                    ),
                });
                await compiler.save(fixture.projectUuid, compilation);
                return compilation;
            },
        );
    };

    const cachedExplores = async (
        projectUuid: string,
    ): Promise<CachedExploreRow[]> =>
        database('cached_explore')
            .select(
                'name',
                'table_names',
                'explore',
                'warehouse_connection_uuid',
            )
            .where('project_uuid', projectUuid)
            .orderBy('name');

    const bindings = async (projectUuid: string) =>
        Object.fromEntries(
            (await cachedExplores(projectUuid)).map((row) => [
                row.name,
                row.warehouse_connection_uuid,
            ]),
        );

    const addExtra = async (
        fixture: Fixture,
        name: string,
        credentials: CreateWarehouseCredentials,
    ) =>
        (
            await warehouseConnectionModel.createExtra(
                await warehouseConnectionModel.getProject(fixture.projectUuid),
                {
                    name,
                    warehouseType: credentials.type,
                    source: { kind: 'project', credentials },
                    listAllDatabases: false,
                    additionalDatabases: [],
                    createdByUserUuid: null as never,
                },
            )
        ).warehouseConnectionUuid;

    const setCredentials = async (
        fixture: Fixture,
        warehouseConnectionUuid: string,
        credentials: CreateWarehouseCredentials,
    ) =>
        warehouseConnectionModel.updateExtraCredentials(
            await warehouseConnectionModel.getProject(fixture.projectUuid),
            warehouseConnectionUuid,
            { kind: 'project', credentials },
        );

    const setDefaultSourceManifests = () => {
        sourceManifests.marketing = dbtManifest('marketing', [
            { name: 'campaigns', database: ORIGINAL_DB, table: 'campaigns' },
        ]);
        sourceManifests.finance = dbtManifest('finance', [
            { name: 'payments', database: EXTRA_DB, table: 'payments' },
        ]);
    };

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('multi_connection_compile');
        database = migrated.database;
        admin = knex({
            client: 'pg',
            connection: {
                ...postgresWarehouse('postgres'),
                database: getAdminDatabase(),
            },
        });
        await createWarehouseDatabase(ORIGINAL_DB, [
            'orders',
            'customers',
            'campaigns',
            'payments',
            'invoices',
        ]);
        await createWarehouseDatabase(EXTRA_DB, [
            'payments',
            'campaigns',
            'refunds',
        ]);
        await createWarehouseDatabase(LISTED_DB, ['ledger']);
        encryptionUtil = new EncryptionUtil({
            lightdashConfig: {
                lightdashSecret: SECRET,
                lightdashSecrets: {
                    active: SECRET,
                    fallbacks: [],
                    all: [SECRET],
                },
            },
        } as never);
        projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
        });
        projectDbtSourcesModel = new ProjectDbtSourcesModel({
            database,
            encryptionUtil,
        });
        const organizationWarehouseCredentialsModel =
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
        warehouseConnectionModel = new WarehouseConnectionModel({
            database,
            encryptionUtil,
            organizationWarehouseCredentialsModel,
        });
        compileCredentials = new ProjectService({
            lightdashConfig: lightdashConfigMock,
            projectCompileModel: new ProjectCompileModel({ database }),
            featureFlagModel: {
                get: async () => ({ id: 'flag', enabled: false }),
            },
            projectModel,
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
            organizationWarehouseCredentialsModel,
            warehouseConnectionModel,
        } as never) as unknown as CompileCredentials;
        warehouseConnectionCompileModel = new WarehouseConnectionCompileModel({
            database,
        });
        compiler = new MultiConnectionCompiler({
            dbtSourceRefCatalogModel: new DbtSourceRefCatalogModel({
                database,
            }),
            projectModel,
            projectDbtSourcesModel,
            warehouseConnectionCompileModel,
            warehouseClientFactory: compileCredentials.warehouseClientFactory,
        });
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
        if (admin) {
            await Promise.all(
                [ORIGINAL_DB, EXTRA_DB, LISTED_DB].map((name) =>
                    admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                        name,
                    ]),
                ),
            );
            await admin.destroy();
        }
    });

    beforeEach(() => {
        setDefaultSourceManifests();
        fetchedWith.length = 0;
        vi.restoreAllMocks();
    });

    const explore = (name: string, tables: string[]): Explore =>
        ({
            name,
            label: name,
            tags: [],
            baseTable: tables[0],
            joinedTables: [],
            tables: Object.fromEntries(
                tables.map((table) => [
                    table,
                    {
                        name: table,
                        label: table,
                        database: 'db',
                        schema: 'public',
                        sqlTable: `"db"."public"."${table}"`,
                        dimensions: {},
                        metrics: {},
                        lineageGraph: {},
                        dbtPackageName: 'primary',
                    },
                ]),
            ),
            targetDatabase: 'postgres',
        }) as unknown as Explore;
    const virtualView = {
        ...explore('virtual_orders', ['virtual_orders']),
        type: ExploreType.VIRTUAL,
    } as Explore;
    const exploreError: ExploreError = {
        name: 'broken',
        label: 'broken',
        errors: [{ type: 'NO_DIMENSIONS_FOUND', message: 'broken' } as never],
    };

    const seedProject = async () => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Parity test' })
            .returning('organization_id');
        const [project] = await database('projects')
            .insert({
                name: 'Parity project',
                organization_id: organization.organization_id,
            } as never)
            .returning('project_uuid');
        await database('cached_explore').insert({
            project_uuid: project.project_uuid,
            name: virtualView.name,
            table_names: Object.keys(virtualView.tables),
            explore: JSON.stringify(virtualView),
        });
        await database('cached_explore').insert({
            project_uuid: project.project_uuid,
            name: 'stale',
            table_names: ['stale'],
            explore: JSON.stringify(explore('stale', ['stale'])),
        });
        return project.project_uuid as string;
    };

    const dump = async (projectUuid: string) =>
        (await cachedExplores(projectUuid)).map((row) => ({
            name: row.name,
            table_names: row.table_names,
            explore: row.explore,
            warehouse_connection_uuid: row.warehouse_connection_uuid,
        }));

    test.each(['single', 'multi'] as const)(
        '%s publication holds the job lock and finishes after shutdown at the staged hook',
        async (savePath) => {
            const fixture = await createProject();
            const jobModel = new JobModel({ database });
            const jobUuid = randomUUID();
            const [user] = await database('users')
                .insert({ first_name: 'Leaf', last_name: 'A' } as never)
                .returning('user_uuid');
            await database('jobs').insert({
                user_uuid: user.user_uuid,
                job_uuid: jobUuid,
                job_type: JobType.COMPILE_PROJECT,
                job_status: JobStatusType.RUNNING,
                project_uuid: fixture.projectUuid,
                is_preview: false,
            });
            const fail = vi.fn(async (uuid: string, message: string) =>
                jobModel.failRunningJob(uuid, message),
            );
            const worker = new SchedulerWorker({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    scheduler: {
                        ...lightdashConfigMock.scheduler,
                        shutdownTimeout: 1000,
                    },
                },
                projectService: { _markInterruptedCompileAsFailed: fail },
            } as unknown as ConstructorParameters<typeof SchedulerWorker>[0]);
            const internals = worker as unknown as {
                runCompileTask(
                    uuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
                managedRunners: Set<{
                    runner: { stop(): Promise<void> };
                    workerPool: null;
                    stopPromise: Promise<void> | null;
                }>;
            };
            let reached!: () => void;
            const staged = new Promise<void>((resolve) => {
                reached = resolve;
            });
            let release!: () => void;
            const pending = new Promise<void>((resolve) => {
                release = resolve;
            });
            let context!: CompileShutdownContext;
            const work = internals.runCompileTask(jobUuid, async () => {
                armCompileShutdown();
                context = compileShutdown.getStore()!;
                const stream = (async function* leafExplores() {
                    yield explore('leaf_a', ['leaf_a']);
                })();
                const beforeWrite = async () => {
                    reached();
                    await pending;
                };
                if (savePath === 'single')
                    await projectModel.saveExploreStreamToCache(
                        fixture.projectUuid,
                        stream,
                        beforeWrite,
                    );
                else
                    await compiler.save(
                        fixture.projectUuid,
                        {
                            exploreStream: stream,
                            bindingOf: () => null,
                            carry: {
                                kind: 'connections',
                                warehouseConnectionUuids: [],
                            },
                            persistArtifacts: async () => {},
                            signal: context.controller.signal,
                        },
                        beforeWrite,
                    );
                expect(context.state).toBe('published');
                expect(context.armed).toBe(true);
                await jobModel.update(jobUuid, {
                    jobStatus: JobStatusType.DONE,
                });
                disarmCompileShutdown();
            });
            internals.managedRunners.add({
                runner: { stop: () => work },
                workerPool: null,
                stopPromise: null,
            });
            try {
                await staged;
                expect(context.state).toBe('publishing');
                await expect(
                    database('jobs')
                        .where('job_uuid', jobUuid)
                        .forUpdate()
                        .noWait()
                        .first(),
                ).rejects.toHaveProperty('code', '55P03');
                const stopping = worker.stop();
                expect(context.controller.signal.aborted).toBe(false);
                expect(fail).not.toHaveBeenCalled();
                release();
                await work;
                await stopping;
                expect((await jobModel.get(jobUuid)).jobStatus).toBe(
                    JobStatusType.DONE,
                );
                expect(
                    (await dump(fixture.projectUuid)).map(({ name }) => name),
                ).toContain('leaf_a');
                expect(fail).not.toHaveBeenCalled();
            } finally {
                release();
                await work;
            }
        },
    );

    test.each(['single', 'multi'] as const)(
        '%s publication refuses a job already marked ERROR',
        async (savePath) => {
            const fixture = await createProject();
            const jobModel = new JobModel({ database });
            const jobUuid = randomUUID();
            const [user] = await database('users')
                .insert({ first_name: 'Leaf', last_name: 'A' } as never)
                .returning('user_uuid');
            await database('jobs').insert({
                user_uuid: user.user_uuid,
                job_uuid: jobUuid,
                job_type: JobType.COMPILE_PROJECT,
                job_status: JobStatusType.RUNNING,
                project_uuid: fixture.projectUuid,
                is_preview: false,
            });
            await jobModel.failRunningJob(
                jobUuid,
                new CompileInterruptedError().message,
            );
            const before = await dump(fixture.projectUuid);
            const context: CompileShutdownContext = {
                controller: new AbortController(),
                jobUuid,
                armed: true,
                state: 'running',
                isStopping: () => false,
                interrupt: () => {},
            };
            await compileShutdown.run(context, async () => {
                const stream = (async function* leafExplores() {
                    yield explore('leaf_a', ['leaf_a']);
                })();
                const saving =
                    savePath === 'single'
                        ? projectModel.saveExploreStreamToCache(
                              fixture.projectUuid,
                              stream,
                          )
                        : compiler.save(fixture.projectUuid, {
                              exploreStream: stream,
                              bindingOf: () => null,
                              carry: {
                                  kind: 'connections',
                                  warehouseConnectionUuids: [],
                              },
                              persistArtifacts: async () => {},
                              signal: context.controller.signal,
                          });
                await expect(saving).rejects.toBeInstanceOf(
                    CompileInterruptedError,
                );
                await jobModel.update(jobUuid, {
                    jobStatus: JobStatusType.DONE,
                });
            });
            expect((await jobModel.get(jobUuid)).jobStatus).toBe(
                JobStatusType.ERROR,
            );
            expect(await dump(fixture.projectUuid)).toEqual(before);
        },
    );

    describe('entry points', () => {
        type PrimaryBuild = {
            adapter: DbtManifestProjectAdapter;
            connection: ScopedWarehouseConnection;
            lease: WarehouseConnectionLease;
            warehouseCredentials: CreateWarehouseCredentials;
            cachedWarehouse: {
                warehouseCatalog: unknown;
                onWarehouseCatalogChange: (catalog: never) => Promise<void>;
            };
            dbtVersionOption: SupportedDbtVersions;
            dbtPartialParse: boolean;
        };
        type CompileInternals = {
            withCompileAdapter: <T>(
                projectUuid: string,
                user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
                fn: (primary: PrimaryBuild) => Promise<T>,
                manifestFetchAdapters: DbtManifestProjectAdapter[],
            ) => Promise<T>;
            testProjectAdapter: () => Promise<PrimaryBuild>;
            buildSourceAdapter: (
                dbtConnection: DbtProjectConfig,
                warehouseLocation: unknown,
                organizationUuid: string | undefined,
                shared: {
                    warehouseCredentials: CreateWarehouseCredentials;
                    connection: ScopedWarehouseConnection;
                },
            ) => Promise<unknown>;
            resolveCompileAdapter: () => Promise<unknown>;
            multiConnectionCompiler: MultiConnectionCompiler;
            getExtraConnectionWarehouseCredentials: CompileCredentials['getExtraConnectionWarehouseCredentials'];
        };

        type CompileServiceOptions = {
            multiDbtSources: boolean;
            peerDbtSources?: boolean;
            crossSourceDbtRefs?: boolean;
            dbtProjectDir: string | undefined;
            primaryModels?: FixtureModel[];
            failedSources?: string[];
            fetchSourceManifest?: (
                source: string,
                options: DbtManifestFetchOptions,
            ) => Promise<DbtManifestFetchResult>;
        };
        const defaultCompileServiceOptions: CompileServiceOptions = {
            multiDbtSources: true,
            dbtProjectDir: undefined,
        };

        const primaryBuild = async (
            projectUuid: string,
            dbtProjectDir: string | undefined,
            models = primaryModels,
        ): Promise<PrimaryBuild> => {
            const warehouseCredentials = postgresWarehouse(ORIGINAL_DB);
            const connection: ScopedWarehouseConnection = {
                warehouseClient:
                    warehouseClientFromCredentials(warehouseCredentials),
                connectionCredentials: warehouseCredentials,
                warehouseCredentials,
                aiPlan: null,
                warehouseConnectionUuid: null,
                connectionRoute: null,
                credentialKind: WarehouseCredentialKind.COMPILE,
                tunnelConnectMs: null,
                deriveClient: (credentials) =>
                    warehouseClientFromCredentials(credentials),
            };
            const cachedWarehouse = {
                warehouseCatalog:
                    await projectModel.getWarehouseFromCache(projectUuid),
                onWarehouseCatalogChange: async (catalog: never) => {
                    await projectModel.saveWarehouseToCache(
                        projectUuid,
                        catalog,
                    );
                },
            };
            return {
                adapter: new DbtManifestProjectAdapter({
                    parsedManifest: dbtManifest('primary', models),
                    warehouseClient: connection.warehouseClient,
                    cachedWarehouse: cachedWarehouse as never,
                    dbtVersion: SupportedDbtVersions.V1_8,
                    dbtProjectDir,
                }),
                connection,
                lease: { ...connection, release: async () => {} },
                warehouseCredentials,
                cachedWarehouse,
                dbtVersionOption: SupportedDbtVersions.V1_8,
                dbtPartialParse: false,
            };
        };

        const compileService = (
            projectUuid: string,
            options: CompileServiceOptions = defaultCompileServiceOptions,
        ) => {
            const analytics = { track: vi.fn() };
            const service = new ProjectService({
                lightdashConfig: lightdashConfigMock,
                analytics,
                projectModel,
                projectCompileModel: new ProjectCompileModel({ database }),
                projectDbtSourcesModel,
                dbtSourceRefCatalogModel: new DbtSourceRefCatalogModel({
                    database,
                }),
                warehouseConnectionModel,
                warehouseConnectionCompileModel,
                userWarehouseCredentialsModel:
                    new UserWarehouseCredentialsModel({
                        database,
                        encryptionUtil,
                    }),
                organizationWarehouseCredentialsModel:
                    new OrganizationWarehouseCredentialsModel({
                        database,
                        encryptionUtil,
                    }),
                jobModel: new JobModel({ database }),
                projectCompileLogModel: new ProjectCompileLogModel({
                    database,
                }),
                featureFlagModel: {
                    get: async ({
                        featureFlagId,
                    }: {
                        featureFlagId: FeatureFlags;
                    }) => {
                        let enabled = options.multiDbtSources;
                        if (featureFlagId === FeatureFlags.PeerDbtSources) {
                            enabled = options.peerDbtSources ?? false;
                        } else if (
                            featureFlagId === FeatureFlags.CrossSourceDbtRefs
                        ) {
                            enabled =
                                options.crossSourceDbtRefs ??
                                options.multiDbtSources;
                        }
                        return { id: 'flag', enabled };
                    },
                },
                catalogModel: {
                    getCatalogItemsWithTags: async () => [],
                    getCatalogItemsWithIcons: async () => [],
                    getAllMetricsTreeEdges: async () => [],
                    getAllMetricsTreeNodes: async () => [],
                },
                schedulerClient: {
                    indexCatalog: async () => 'index-catalog-job',
                    generateValidation: async () => {},
                },
                tagsModel: {
                    replaceYamlTags: async () => ({
                        yamlTagsToCreateOrUpdate: [],
                    }),
                },
                projectParametersModel: new ProjectParametersModel({
                    database,
                }),
            } as never);
            const internals = service as unknown as CompileInternals;
            vi.spyOn(internals, 'withCompileAdapter').mockImplementation(
                async (_projectUuid, _user, fn) => {
                    const primary = await primaryBuild(
                        projectUuid,
                        options.dbtProjectDir,
                        options.primaryModels,
                    );
                    try {
                        return await fn(primary);
                    } finally {
                        await primary.adapter.destroy();
                    }
                },
            );
            vi.spyOn(internals, 'testProjectAdapter').mockImplementation(() =>
                primaryBuild(
                    projectUuid,
                    options.dbtProjectDir,
                    options.primaryModels,
                ),
            );
            vi.spyOn(internals, 'buildSourceAdapter').mockImplementation(
                async (dbtConnection, _location, _organization, shared) => {
                    const name = (
                        dbtConnection as { repository: string }
                    ).repository.replace('org/', '');
                    fetchedWith.push({
                        source: name,
                        dbname:
                            'dbname' in shared.warehouseCredentials
                                ? String(shared.warehouseCredentials.dbname)
                                : '',
                    });
                    return {
                        prepareDbtSource: async () => {
                            if (options.failedSources?.includes(name))
                                throw new Error('Repository clone failed');
                            return {
                                projectDir: null,
                                timings: { gitRefreshMs: null, depsMs: null },
                            };
                        },
                        getDbtManifest: async (
                            fetchOptions: DbtManifestFetchOptions,
                        ) =>
                            options.fetchSourceManifest
                                ? options.fetchSourceManifest(
                                      name,
                                      fetchOptions,
                                  )
                                : {
                                      manifest: sourceManifests[name],
                                      timings: {
                                          gitRefreshMs: null,
                                          depsMs: null,
                                          manifestMs: 0,
                                      },
                                  },
                        releaseDisk: async () => {},
                        destroy: async () => {},
                    };
                },
            );
            return { service, internals, analytics };
        };

        const compilingUser = async (projectUuid: string) => {
            const { organizationUuid } =
                await projectModel.getSummary(projectUuid);
            const [user] = await database('users')
                .insert({ first_name: 'Compile', last_name: 'User' } as never)
                .returning('user_uuid');
            return {
                ...defaultSessionUser,
                userUuid: user.user_uuid as string,
                organizationUuid,
                ability: new Ability<PossibleAbilities>([
                    { subject: 'all', action: 'manage' },
                ] as never),
            } as SessionUser;
        };

        const createJob = async (projectUuid: string, userUuid: string) => {
            const jobUuid = randomUUID();
            await new JobModel({ database }).create(
                {
                    jobUuid,
                    jobType: JobType.COMPILE_PROJECT,
                    jobStatus: JobStatusType.STARTED,
                    userUuid,
                    projectUuid,
                    steps: [{ stepType: JobStepType.COMPILING }],
                },
                false,
            );
            return jobUuid;
        };

        const runCompileProject = async (
            projectUuid: string,
            options = defaultCompileServiceOptions,
        ) => {
            const { service, internals } = compileService(projectUuid, options);
            const user = await compilingUser(projectUuid);
            const jobUuid = await createJob(projectUuid, user.userUuid);
            await service.compileProject(
                user,
                projectUuid,
                RequestMethod.WEB_APP,
                jobUuid,
            );
            return {
                internals,
                job: await new JobModel({ database }).get(jobUuid),
            };
        };

        const runTestAndCompileProject = async (projectUuid: string) => {
            const { service, internals } = compileService(projectUuid);
            const user = await compilingUser(projectUuid);
            const jobUuid = randomUUID();
            await new JobModel({ database }).create(
                {
                    jobUuid,
                    jobType: JobType.COMPILE_PROJECT,
                    jobStatus: JobStatusType.STARTED,
                    userUuid: user.userUuid,
                    projectUuid,
                    steps: [
                        { stepType: JobStepType.TESTING_ADAPTOR },
                        { stepType: JobStepType.COMPILING },
                    ],
                },
                false,
            );
            await service.testAndCompileProject(
                user,
                projectUuid,
                RequestMethod.WEB_APP,
                jobUuid,
            );
            return {
                internals,
                job: await new JobModel({ database }).get(jobUuid),
            };
        };

        const latestReport = async (projectUuid: string) =>
            (
                await database('project_compile_log')
                    .select('report')
                    .where('project_uuid', projectUuid)
                    .orderBy('created_at', 'desc')
                    .first()
            )?.report;

        test.each(['single', 'multi'] as const)(
            'a %s connection route publishes stable names and reports final warnings',
            async (route) => {
                const fixture = await createProject();
                if (route === 'single')
                    await database('projects')
                        .where('project_uuid', fixture.projectUuid)
                        .update({ connection_mode: 'single' } as never);
                await runCompileProject(fixture.projectUuid);
                sourceManifests.finance = dbtManifest('finance', [
                    {
                        name: 'orders',
                        database: route === 'single' ? ORIGINAL_DB : EXTRA_DB,
                        table: 'orders',
                    },
                ]);
                const { job } = await runCompileProject(fixture.projectUuid);
                const report = await latestReport(fixture.projectUuid);
                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(job.jobResults).toMatchObject({
                    connectionWarnings: [
                        expect.stringContaining('finance__orders'),
                    ],
                });
                expect(report).toMatchObject({
                    errorExploresCount: 0,
                    successfulExploresCount: 4,
                    baseTableNames: expect.arrayContaining([
                        'orders',
                        'finance__orders',
                    ]),
                    connectionWarnings: [
                        expect.stringContaining('model.primary.orders'),
                    ],
                });
                expect(await bindings(fixture.projectUuid)).toMatchObject({
                    orders: null,
                    finance__orders:
                        route === 'single' ? null : fixture.extraConnectionUuid,
                });
                expect(JSON.stringify(report)).not.toContain('__model_');
            },
        );

        test('the compile report counts a naming collision as one model error and keeps the other models', async () => {
            const fixture = await createProject();
            const { service } = compileService(fixture.projectUuid, {
                ...defaultCompileServiceOptions,
                primaryModels: [
                    ...primaryModels,
                    {
                        name: 'finance__orders',
                        database: ORIGINAL_DB,
                        table: 'orders',
                    },
                ],
            });
            const user = await compilingUser(fixture.projectUuid);
            const firstJob = await createJob(
                fixture.projectUuid,
                user.userUuid,
            );
            await service.compileProject(
                user,
                fixture.projectUuid,
                RequestMethod.WEB_APP,
                firstJob,
            );
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            const secondJob = await createJob(
                fixture.projectUuid,
                user.userUuid,
            );
            await service.compileProject(
                user,
                fixture.projectUuid,
                RequestMethod.WEB_APP,
                secondJob,
            );
            const report = await latestReport(fixture.projectUuid);
            expect(report).toMatchObject({
                errorExploresCount: 1,
                successfulExploresCount: 4,
                totalExploresCount: 5,
                exploresWithErrors: [
                    {
                        name: 'finance__orders__conflict',
                        errors: [{ type: 'EXPLORE_NAME_COLLISION' }],
                    },
                ],
            });
            expect(report.baseTableNames).toContain('finance__orders');
            expect(JSON.stringify(report)).not.toContain('__model_');
        });

        test.each([
            {
                refreshBeforeDeploy: false,
                collision: true,
                qualifiedConflict: false,
                connectionMode: 'single',
            },
            {
                refreshBeforeDeploy: true,
                collision: true,
                qualifiedConflict: false,
                connectionMode: 'single',
            },
            {
                refreshBeforeDeploy: false,
                collision: false,
                qualifiedConflict: false,
                connectionMode: 'single',
            },
            {
                refreshBeforeDeploy: true,
                collision: false,
                qualifiedConflict: false,
                connectionMode: 'single',
            },
            {
                refreshBeforeDeploy: false,
                collision: true,
                qualifiedConflict: true,
                connectionMode: 'single',
            },
            {
                refreshBeforeDeploy: false,
                collision: true,
                qualifiedConflict: false,
                connectionMode: 'multi',
            },
        ])(
            'legacy primary cache survives a first source deploy (refresh $refreshBeforeDeploy, collision $collision, qualified conflict $qualifiedConflict, mode $connectionMode)',
            async ({
                refreshBeforeDeploy,
                collision,
                qualifiedConflict,
                connectionMode,
            }) => {
                const fixture = await createProject(
                    postgresWarehouse(EXTRA_DB),
                    { listAllDatabases: false, additionalDatabases: [] },
                    false,
                );
                await database('projects')
                    .where('project_uuid', fixture.projectUuid)
                    .update({ connection_mode: 'single' } as never);
                await database('warehouse_connections')
                    .where(
                        'warehouse_connection_uuid',
                        fixture.extraConnectionUuid,
                    )
                    .delete();
                const models = [
                    ...primaryModels,
                    {
                        name: 'ledger',
                        database: ORIGINAL_DB,
                        table: 'payments',
                    },
                    ...(qualifiedConflict
                        ? [
                              {
                                  name: 'merchants__ledger',
                                  database: ORIGINAL_DB,
                                  table: 'customers',
                              },
                          ]
                        : []),
                ];
                const { service } = compileService(fixture.projectUuid, {
                    ...defaultCompileServiceOptions,
                    primaryModels: models,
                });
                const user = await compilingUser(fixture.projectUuid);
                const account = fromSession(user, 'session-cookie');
                vi.spyOn(service, 'getUserAttributes').mockResolvedValue({
                    userAttributes: {},
                    intrinsicUserAttributes: {},
                });
                const refresh = async () => {
                    const jobUuid = await createJob(
                        fixture.projectUuid,
                        user.userUuid,
                    );
                    await service.compileProject(
                        user,
                        fixture.projectUuid,
                        RequestMethod.WEB_APP,
                        jobUuid,
                    );
                    expect(
                        (await new JobModel({ database }).get(jobUuid))
                            .jobStatus,
                    ).toBe(JobStatusType.DONE);
                };
                await refresh();
                const legacy = await projectModel.getExploreFromCache(
                    fixture.projectUuid,
                    'ledger',
                );
                expect(legacy.tables?.ledger.dbtSourceUuid).toBeUndefined();
                expect(
                    await database('explore_name_allocations').where(
                        'project_uuid',
                        fixture.projectUuid,
                    ),
                ).toEqual([]);
                const source = await projectDbtSourcesModel.createSource(
                    fixture.projectUuid,
                    {
                        name: 'merchants',
                        isPrimary: false,
                        precedence: 1,
                        dbtConnection: githubDbtConnection('org/merchants'),
                        warehouseLocation: { database: null, schema: null },
                    },
                );
                await database('projects')
                    .where('project_uuid', fixture.projectUuid)
                    .update({ connection_mode: connectionMode } as never);
                const modelName = collision ? 'ledger' : 'merchant_ledger';
                sourceManifests.merchants = dbtManifest('merchants', [
                    {
                        name: modelName,
                        database: ORIGINAL_DB,
                        table: 'invoices',
                    },
                ]);
                if (refreshBeforeDeploy) await refresh();
                const uploaded = explore(modelName, [modelName]);
                uploaded.dbtModelIdentity = {
                    sourceUuid: null,
                    sourceName: null,
                    packageName: 'merchants',
                    uniqueId: `model.merchants.${modelName}`,
                    modelName,
                };
                uploaded.tables[modelName].dbtPackageName = 'merchants';
                uploaded.tables[modelName].dbtModelUniqueId =
                    `model.merchants.${modelName}`;
                const before = await dump(fixture.projectUuid);
                const deploy = service.saveDeployExplores({
                    userUuid: user.userUuid,
                    projectUuid: fixture.projectUuid,
                    explores: [uploaded],
                    complete: true,
                    compilationSource: 'cli_deploy',
                    cliDeploy: {
                        sourceUuid: source.projectDbtSourceUuid,
                        target: null,
                    },
                });
                if (qualifiedConflict) {
                    await expect(deploy).rejects.toThrow(
                        'cannot use explore name "merchants__ledger"',
                    );
                    expect(await dump(fixture.projectUuid)).toEqual(before);
                    expect(
                        await database('explore_name_allocations').where(
                            'project_uuid',
                            fixture.projectUuid,
                        ),
                    ).toEqual([]);
                    await expect(
                        service.getExplore(
                            account,
                            fixture.projectUuid,
                            'ledger',
                        ),
                    ).resolves.toMatchObject({ name: 'ledger' });
                    return;
                }
                await deploy;
                const published = await bindings(fixture.projectUuid);
                const allocations = await database('explore_name_allocations')
                    .select(
                        'name',
                        'source_key',
                        'model_unique_id',
                        'is_reserved',
                    )
                    .where('project_uuid', fixture.projectUuid)
                    .orderBy('name');
                const assignedName = collision
                    ? 'merchants__ledger'
                    : modelName;
                expect(published).toEqual({
                    customers: null,
                    ledger: null,
                    orders: null,
                    [assignedName]: null,
                });
                expect(allocations).toEqual(
                    [
                        ...models.map(({ name }) => ({
                            name,
                            source_key: 'primary',
                            model_unique_id: `model.primary.${name}`,
                            is_reserved: false,
                        })),
                        {
                            name: assignedName,
                            source_key: source.projectDbtSourceUuid,
                            model_unique_id: `model.merchants.${modelName}`,
                            is_reserved: false,
                        },
                    ].sort((left, right) =>
                        left.name.localeCompare(right.name),
                    ),
                );
                const { dbtSourceUuid, dbtSourceName } =
                    await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                await Promise.all(
                    models.map(async ({ name }) => {
                        const fetched = await service.getExplore(
                            account,
                            fixture.projectUuid,
                            name,
                        );
                        expect(fetched.name).toBe(name);
                        expect(fetched.tables[fetched.baseTable]).toMatchObject(
                            {
                                dbtSourceUuid,
                                dbtSourceName,
                            },
                        );
                    }),
                );
                await refresh();
                expect(await bindings(fixture.projectUuid)).toEqual({
                    customers: null,
                    ledger: null,
                    orders: null,
                    [assignedName]: null,
                });
                expect(
                    await projectModel.getExploreFromCache(
                        fixture.projectUuid,
                        'ledger',
                    ),
                ).toMatchObject({ name: 'ledger' });
            },
        );

        test('a primary qualified name survives removal of all other sources and connections', async () => {
            const fixture = await createProject();
            const user = await compilingUser(fixture.projectUuid);
            const { service } = compileService(fixture.projectUuid);
            const initial = explore('orders', ['orders']);
            initial.tables.orders.dbtPackageName = 'finance';
            initial.tables.orders.dbtModelUniqueId = 'model.finance.orders';
            await service.saveDeployExplores({
                userUuid: user.userUuid,
                projectUuid: fixture.projectUuid,
                explores: [initial],
                complete: true,
                compilationSource: 'cli_deploy',
                cliDeploy: {
                    sourceUuid: fixture.sourceUuids.finance,
                    target: null,
                },
            });
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            await runCompileProject(fixture.projectUuid);
            const { dbtSourceName } = await projectModel.getDbtSourceIdentity(
                fixture.projectUuid,
            );
            expect(await bindings(fixture.projectUuid)).toHaveProperty(
                `${dbtSourceName}__orders`,
            );
            await database('project_dbt_sources')
                .where('project_uuid', fixture.projectUuid)
                .delete();
            const removedSources = await runCompileProject(fixture.projectUuid);
            expect(removedSources.job.jobStatus).toBe(JobStatusType.DONE);
            await database('warehouse_connections')
                .where('warehouse_connection_uuid', fixture.extraConnectionUuid)
                .delete();
            const { job } = await runCompileProject(fixture.projectUuid);
            expect(job.jobStatus).toBe(JobStatusType.DONE);
            expect(await bindings(fixture.projectUuid)).toEqual({
                customers: null,
                [`${dbtSourceName}__orders`]: null,
            });
            expect(
                await database('explore_name_allocations')
                    .where('project_uuid', fixture.projectUuid)
                    .whereNot('source_key', 'primary'),
            ).toEqual([]);
        });

        const killExtraWarehouse = async (fixture: Fixture) =>
            warehouseConnectionModel.updateExtraCredentials(
                await warehouseConnectionModel.getProject(fixture.projectUuid),
                fixture.extraConnectionUuid,
                {
                    kind: 'project',
                    credentials: postgresWarehouse(EXTRA_DB, DEAD_PORT),
                },
            );

        test.each([
            ['compileProject', runCompileProject],
            ['testAndCompileProject', runTestAndCompileProject],
        ] as const)(
            '%s on a multi project compiles each connection with its stored credentials and saves the bindings',
            async (_entryPoint, run) => {
                const fixture = await createProject();

                const { job } = await run(fixture.projectUuid);

                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(job.jobResults).not.toHaveProperty('connectionWarnings');
                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    customers: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
                expect(fetchedWith).toContainEqual({
                    source: 'finance',
                    dbname: EXTRA_DB,
                });
                expect(
                    await latestReport(fixture.projectUuid),
                ).not.toHaveProperty('connectionWarnings');
            },
        );

        test.each([
            ['compileProject', runCompileProject],
            ['testAndCompileProject', runTestAndCompileProject],
        ] as const)(
            '%s on a multi project with a dead extra warehouse keeps its explores and reports the connection in the job result and compile log',
            async (_entryPoint, run) => {
                const fixture = await createProject();
                await run(fixture.projectUuid);
                await killExtraWarehouse(fixture);

                const { job } = await run(fixture.projectUuid);

                expect(job.jobStatus).toBe(JobStatusType.DONE);
                const expectedWarning = expect.stringContaining(
                    'Connection "Finance warehouse" failed to compile, so its previous explores are kept',
                );
                expect(job.jobResults).toMatchObject({
                    connectionWarnings: [expectedWarning],
                });
                expect(await latestReport(fixture.projectUuid)).toMatchObject({
                    connectionWarnings: [expectedWarning],
                });
                expect((await bindings(fixture.projectUuid)).payments).toBe(
                    fixture.extraConnectionUuid,
                );
            },
        );

        test('compileProject loads extra connection credentials through the compile purpose, never a personal credential', async () => {
            const fixture = await createProject();
            const { service, internals } = compileService(fixture.projectUuid);
            const loadCredentials = vi.spyOn(
                internals,
                'getExtraConnectionWarehouseCredentials',
            );
            const user = await compilingUser(fixture.projectUuid);
            const jobUuid = await createJob(fixture.projectUuid, user.userUuid);

            await service.compileProject(
                user,
                fixture.projectUuid,
                RequestMethod.WEB_APP,
                jobUuid,
            );

            expect(loadCredentials.mock.calls).toEqual([
                [
                    {
                        projectUuid: fixture.projectUuid,
                        warehouseConnectionUuid: fixture.extraConnectionUuid,
                        userId: user.userUuid,
                        isRegisteredUser: true,
                        purpose: 'compile',
                    },
                ],
            ]);
        });

        test.each([
            ['compileProject', runCompileProject],
            ['testAndCompileProject', runTestAndCompileProject],
        ] as const)(
            '%s on one connection allocates source names without using the multi compiler',
            async (_entryPoint, run) => {
                const fixture = await createProject();
                await database('projects')
                    .update({ connection_mode: 'single' } as never)
                    .where('project_uuid', fixture.projectUuid);
                const multiCompile = vi.spyOn(
                    MultiConnectionCompiler.prototype,
                    'compile',
                );
                const multiSave = vi.spyOn(
                    MultiConnectionCompiler.prototype,
                    'save',
                );
                const mainSave = vi.spyOn(
                    projectModel,
                    'saveExploreStreamToCache',
                );

                const { job } = await run(fixture.projectUuid);

                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(multiCompile).not.toHaveBeenCalled();
                expect(multiSave).toHaveBeenCalledTimes(1);
                expect(mainSave).not.toHaveBeenCalled();
                expect(job.jobResults).not.toHaveProperty('connectionWarnings');
                expect(
                    await latestReport(fixture.projectUuid),
                ).not.toHaveProperty('connectionWarnings');
                expect(
                    Object.values(await bindings(fixture.projectUuid)),
                ).toEqual([null, null, null, null]);
                expect(fetchedWith).toContainEqual({
                    source: 'finance',
                    dbname: ORIGINAL_DB,
                });
            },
        );

        const routeSingle = async (projectUuid: string) =>
            database('projects')
                .update({ connection_mode: 'single' } as never)
                .where('project_uuid', projectUuid);

        const seedCachedExplores = async (projectUuid: string) => {
            await database('cached_explore').insert({
                project_uuid: projectUuid,
                name: virtualView.name,
                table_names: Object.keys(virtualView.tables),
                explore: JSON.stringify(virtualView),
            });
            await database('cached_explore').insert({
                project_uuid: projectUuid,
                name: 'stale',
                table_names: ['stale'],
                explore: JSON.stringify(explore('stale', ['stale'])),
            });
        };

        const deployInputs = (): (Explore | ExploreError)[] => [
            explore('orders', ['orders', 'customers']),
            explore('customers', ['customers']),
            exploreError,
        ];

        test.each([
            { complete: true, dbtModelNames: undefined },
            { complete: false, dbtModelNames: ['orders'] },
            { complete: undefined, dbtModelNames: undefined },
        ])(
            'setExplores on a single project writes the rows of the main deploy save (complete $complete)',
            async ({ complete, dbtModelNames }) => {
                const deployed = await createProject(
                    postgresWarehouse(EXTRA_DB),
                    { listAllDatabases: false, additionalDatabases: [] },
                    false,
                );
                const baseline = await createProject(
                    postgresWarehouse(EXTRA_DB),
                    { listAllDatabases: false, additionalDatabases: [] },
                    false,
                );
                await Promise.all(
                    [deployed, baseline].map(async ({ projectUuid }) => {
                        await routeSingle(projectUuid);
                        await seedCachedExplores(projectUuid);
                    }),
                );
                const user = await compilingUser(deployed.projectUuid);
                const multiSave = vi.spyOn(
                    MultiConnectionCompiler.prototype,
                    'save',
                );

                await compileService(deployed.projectUuid).service.setExplores(
                    user,
                    deployed.projectUuid,
                    deployInputs(),
                    'cli-1',
                    complete,
                    dbtModelNames,
                );
                await compileService(
                    baseline.projectUuid,
                ).service.saveExploresToCacheAndIndexCatalog({
                    userUuid: user.userUuid,
                    projectUuid: baseline.projectUuid,
                    explores: deployInputs(),
                    compilationSource: 'cli_deploy',
                    jobUuid: null,
                    requestMethod: 'cli',
                    cliVersion: 'cli-1',
                    complete,
                    dbtModelNames,
                });

                expect(await dump(deployed.projectUuid)).toEqual(
                    await dump(baseline.projectUuid),
                );
                expect(multiSave).not.toHaveBeenCalled();
            },
        );

        describe('sourceless complete source inference', () => {
            const packagedExplore = (
                name: string,
                packageName: string,
                sourceUuid?: string,
            ): Explore => {
                const compiled = explore(name, [name]);
                compiled.tables[name] = {
                    ...compiled.tables[name],
                    dbtPackageName: packageName,
                    ...(sourceUuid ? { dbtSourceUuid: sourceUuid } : {}),
                };
                return compiled;
            };

            const expectedRejection = (
                reason: string,
            ) => `This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: ${reason}.

To fix it, make sure each dbt project has a distinct name in its dbt_project.yml, and that the repository you are deploying from is added as a dbt source in the project settings. If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.

Sources in this project: Core models, marketing, finance.`;

            const setup = async (
                projectType = ProjectType.DEFAULT,
                upstreamProjectUuid?: string,
            ) => {
                const fixture = await createProject(
                    undefined,
                    undefined,
                    true,
                    projectType,
                    upstreamProjectUuid,
                );
                await bind(fixture, 'finance', null);
                await routeSingle(fixture.projectUuid);
                await projectModel.updateDbtSourceName(
                    fixture.projectUuid,
                    'Core models',
                );
                const primary = await projectModel.getDbtSourceIdentity(
                    fixture.projectUuid,
                );
                await projectModel.saveExploresToCache(
                    fixture.projectUuid,
                    [
                        packagedExplore(
                            'orders',
                            'analytics',
                            primary.dbtSourceUuid,
                        ),
                        packagedExplore(
                            'retired',
                            'analytics',
                            primary.dbtSourceUuid,
                        ),
                        packagedExplore(
                            'campaigns',
                            'marketing',
                            fixture.sourceUuids.marketing,
                        ),
                        packagedExplore(
                            'payments',
                            'finance',
                            fixture.sourceUuids.finance,
                        ),
                    ],
                    true,
                );
                const user = await compilingUser(fixture.projectUuid);
                const { service } = compileService(fixture.projectUuid);
                const deploy = (
                    overrides: Partial<
                        Parameters<typeof service.saveDeployExplores>[0]
                    > = {},
                ) =>
                    service
                        .saveDeployExplores({
                            projectUuid: fixture.projectUuid,
                            userUuid: user.userUuid,
                            compilationSource: 'cli_deploy',
                            explores: [packagedExplore('orders', 'analytics')],
                            complete: true,
                            cliDeploy: { sourceUuid: null, target: null },
                            ...overrides,
                        })
                        .catch((error: unknown) => {
                            if (error instanceof ConflictError) {
                                expect(error.message).not.toContain('--source');
                                expect(error.message).not.toContain(
                                    'set-source',
                                );
                            }
                            throw error;
                        });
                return { fixture, primary, deploy, service };
            };

            const seedGuardedState = async (projectUuid: string) => {
                const user = await compilingUser(projectUuid);
                const [project] = await database('projects').where(
                    'project_uuid',
                    projectUuid,
                );
                await database('projects')
                    .where('project_uuid', projectUuid)
                    .update({
                        project_defaults: { case_sensitive: false },
                        table_groups: { retained: { label: 'Retained group' } },
                    });
                await database('project_parameters').insert({
                    project_uuid: projectUuid,
                    name: 'minimum_amount',
                    config: {
                        label: 'Minimum amount',
                        type: 'number',
                        default: 5,
                    },
                });
                const tags = await database('tags')
                    .insert({
                        project_uuid: projectUuid,
                        name: 'Payments',
                        color: 'blue',
                        yaml_reference: 'payments',
                        created_by_user_uuid: null,
                    })
                    .returning('*');
                await new CatalogModel({
                    database,
                    lightdashConfig: lightdashConfigMock,
                }).indexCatalog(
                    projectUuid,
                    await projectModel.getAllExploresFromCache(projectUuid),
                    tags,
                    user.userUuid,
                );
                const rawTable = (name: string) =>
                    database<Record<string, unknown>>(name);
                const [space] = await rawTable('spaces')
                    .insert({
                        project_id: project.project_id,
                        name: 'Retained space',
                        slug: 'retained-space',
                        path: 'retained_space',
                    })
                    .returning('*');
                const [chart] = await rawTable('saved_queries')
                    .insert({
                        project_uuid: projectUuid,
                        space_id: space.space_id,
                        name: 'Retained chart',
                        slug: 'retained-chart',
                        last_version_chart_kind: 'cartesian',
                        last_version_updated_by_user_uuid: user.userUuid,
                    })
                    .returning('*');
                await rawTable('saved_queries_versions').insert({
                    saved_query_id: chart.saved_query_id,
                    explore_name: 'orders',
                    filters: {},
                    row_limit: 10,
                    chart_type: 'cartesian',
                    chart_config: {},
                    updated_by_user_uuid: user.userUuid,
                });
                return async () => {
                    const [row] = await database(
                        'saved_queries_versions as version',
                    )
                        .join(
                            'saved_queries as chart',
                            'chart.saved_query_id',
                            'version.saved_query_id',
                        )
                        .join(
                            'cached_explore as explore',
                            function joinExplore() {
                                this.on(
                                    'explore.name',
                                    'version.explore_name',
                                ).andOn(
                                    'explore.project_uuid',
                                    'chart.project_uuid',
                                );
                            },
                        )
                        .where('chart.project_uuid', projectUuid)
                        .select('explore.explore');
                    const saved = row.explore as Explore;
                    return saved.tables[saved.baseTable].dbtSourceUuid;
                };
            };

            const guardedState = async (projectUuid: string) => ({
                explores: await dump(projectUuid),
                project: await database('projects')
                    .where('project_uuid', projectUuid)
                    .first(),
                parameters: await database('project_parameters')
                    .where('project_uuid', projectUuid)
                    .orderBy('name'),
                tags: await database('tags')
                    .where('project_uuid', projectUuid)
                    .orderBy('name'),
                catalog: await database('catalog_search')
                    .where('project_uuid', projectUuid)
                    .orderBy('catalog_search_uuid'),
                charts: await database('saved_queries_versions')
                    .whereIn(
                        'saved_query_id',
                        database('saved_queries')
                            .select('saved_query_id')
                            .where('project_uuid', projectUuid),
                    )
                    .orderBy('saved_queries_version_id'),
            });

            test.each([false, true])(
                'preserves a CLI-first saved ledger chart without a server refresh (explicit %s)',
                async (explicit) => {
                    const fixture = await createProject(
                        undefined,
                        undefined,
                        false,
                    );
                    await routeSingle(fixture.projectUuid);
                    await database('warehouse_connections')
                        .where('project_uuid', fixture.projectUuid)
                        .where('is_original', false)
                        .delete();
                    await projectModel.updateDbtSourceName(
                        fixture.projectUuid,
                        'payments',
                    );
                    const primary = await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                    const user = await compilingUser(fixture.projectUuid);
                    const { service } = compileService(fixture.projectUuid);
                    const compileUpload = async (
                        packageName: string,
                        table: string,
                    ) => {
                        const result = await convertExplores(
                            getModelsFromManifest(
                                dbtManifest(packageName, [
                                    {
                                        name: 'ledger',
                                        database: ORIGINAL_DB,
                                        table,
                                    },
                                ]),
                            ),
                            false,
                            SupportedDbtAdapter.POSTGRES,
                            warehouseSqlBuilderFromType(
                                SupportedDbtAdapter.POSTGRES,
                            ),
                            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                            { includeModelIdentity: true },
                        );
                        expect(result).toHaveLength(1);
                        expect(isExploreError(result[0])).toBe(false);
                        return result;
                    };
                    const deploy = (
                        explores: (Explore | ExploreError)[],
                        sourceUuid: string | null,
                    ) =>
                        service.saveDeployExplores({
                            projectUuid: fixture.projectUuid,
                            userUuid: user.userUuid,
                            explores,
                            compilationSource: 'cli_deploy',
                            complete: true,
                            cliDeploy: { sourceUuid, target: null },
                        });
                    expect(await cachedExplores(fixture.projectUuid)).toEqual(
                        [],
                    );
                    await expect(
                        deploy(
                            await compileUpload('payments', 'payments'),
                            explicit ? primary.dbtSourceUuid : null,
                        ),
                    ).resolves.toEqual(expect.any(String));
                    expect(await bindings(fixture.projectUuid)).toEqual({
                        ledger: null,
                    });
                    const firstOwner = await projectModel.getExploreFromCache(
                        fixture.projectUuid,
                        'ledger',
                    );
                    expect(
                        firstOwner.tables?.ledger.dbtSourceUuid,
                    ).toBeUndefined();
                    expect(firstOwner.tables?.ledger.dbtPackageName).toBe(
                        'payments',
                    );
                    expect(firstOwner.dbtModelIdentity).toMatchObject({
                        packageName: 'payments',
                        uniqueId: 'model.payments.ledger',
                        sourceUuid: null,
                    });
                    expect(
                        await database('explore_name_allocations').where(
                            'project_uuid',
                            fixture.projectUuid,
                        ),
                    ).toEqual([]);
                    const [project] = await database('projects').where(
                        'project_uuid',
                        fixture.projectUuid,
                    );
                    const rawTable = (name: string) =>
                        database<Record<string, unknown>>(name);
                    const [space] = await rawTable('spaces')
                        .insert({
                            project_id: project.project_id,
                            name: 'CLI ledger space',
                            slug: 'cli-ledger-space',
                            path: 'cli_ledger_space',
                        })
                        .returning('*');
                    const [chart] = await rawTable('saved_queries')
                        .insert({
                            project_uuid: fixture.projectUuid,
                            space_id: space.space_id,
                            name: 'CLI ledger chart',
                            slug: 'cli-ledger-chart',
                            last_version_chart_kind: 'cartesian',
                            last_version_updated_by_user_uuid: user.userUuid,
                        })
                        .returning('*');
                    await rawTable('saved_queries_versions').insert({
                        saved_query_id: chart.saved_query_id,
                        explore_name: 'ledger',
                        filters: {},
                        row_limit: 10,
                        chart_type: 'cartesian',
                        chart_config: {},
                        updated_by_user_uuid: user.userUuid,
                    });
                    const source = await projectDbtSourcesModel.createSource(
                        fixture.projectUuid,
                        {
                            name: 'marketing',
                            isPrimary: false,
                            precedence: 1,
                            dbtConnection: githubDbtConnection('org/marketing'),
                            warehouseLocation: { database: null, schema: null },
                        },
                    );
                    await database('projects')
                        .where('project_uuid', fixture.projectUuid)
                        .update({
                            project_defaults: { case_sensitive: false },
                            table_groups: {
                                retained: { label: 'Retained group' },
                            },
                        });
                    await database('project_parameters').insert({
                        project_uuid: fixture.projectUuid,
                        name: 'minimum_amount',
                        config: {
                            label: 'Minimum amount',
                            type: 'number',
                            default: 5,
                        },
                    });
                    await database('tags').insert({
                        project_uuid: fixture.projectUuid,
                        name: 'Ledger',
                        color: 'blue',
                        yaml_reference: 'ledger',
                        created_by_user_uuid: null,
                    });
                    const warehouse = knex({
                        client: 'pg',
                        connection: {
                            ...postgresWarehouse(ORIGINAL_DB),
                            database: ORIGINAL_DB,
                        },
                    });
                    try {
                        await warehouse('payments').delete();
                        await warehouse('customers').delete();
                        await warehouse('payments').insert({
                            id: 1,
                            amount: 17,
                        });
                        await warehouse('customers').insert({
                            id: 2,
                            amount: 29,
                        });
                        const chartData = async () => {
                            const storedChart = await database(
                                'saved_queries_versions',
                            )
                                .where(
                                    'saved_query_id',
                                    Number(chart.saved_query_id),
                                )
                                .select({ tableName: 'explore_name' })
                                .first();
                            expect(storedChart?.tableName).toBe('ledger');
                            const saved =
                                await projectModel.getExploreFromCache(
                                    fixture.projectUuid,
                                    storedChart!.tableName,
                                );
                            return (
                                await warehouse.raw(
                                    `SELECT id, amount FROM ${saved.tables![saved.baseTable!].sqlTable} ORDER BY id`,
                                )
                            ).rows;
                        };
                        expect(await chartData()).toEqual([
                            { id: 1, amount: 17 },
                        ]);
                        const before = await guardedState(fixture.projectUuid);
                        const upload = await compileUpload(
                            'marketing',
                            'customers',
                        );
                        if (explicit) {
                            await deploy(upload, source.projectDbtSourceUuid);
                            expect(await bindings(fixture.projectUuid)).toEqual(
                                { ledger: null, marketing__ledger: null },
                            );
                            const owner =
                                await projectModel.getExploreFromCache(
                                    fixture.projectUuid,
                                    'ledger',
                                );
                            const newcomer =
                                await projectModel.getExploreFromCache(
                                    fixture.projectUuid,
                                    'marketing__ledger',
                                );
                            expect(owner.tables?.ledger.dbtSourceUuid).toBe(
                                primary.dbtSourceUuid,
                            );
                            expect(
                                newcomer.tables?.marketing__ledger
                                    .dbtSourceUuid,
                            ).toBe(source.projectDbtSourceUuid);
                            expect(
                                (
                                    await warehouse.raw(
                                        `SELECT id, amount FROM ${newcomer.tables!.marketing__ledger.sqlTable} ORDER BY id`,
                                    )
                                ).rows,
                            ).toEqual([{ id: 2, amount: 29 }]);
                            expect(
                                await database('explore_name_allocations')
                                    .where('project_uuid', fixture.projectUuid)
                                    .select(
                                        'name',
                                        'source_key',
                                        'package_name',
                                        'model_unique_id',
                                        'is_reserved',
                                    )
                                    .orderBy('name'),
                            ).toEqual([
                                {
                                    name: 'ledger',
                                    source_key: 'primary',
                                    package_name: 'payments',
                                    model_unique_id: 'model.payments.ledger',
                                    is_reserved: false,
                                },
                                {
                                    name: 'marketing__ledger',
                                    source_key: source.projectDbtSourceUuid,
                                    package_name: 'marketing',
                                    model_unique_id: 'model.marketing.ledger',
                                    is_reserved: false,
                                },
                            ]);
                        } else {
                            await expect(
                                deploy(upload, null),
                            ).rejects.toMatchObject({
                                statusCode: 409,
                                message: expect.stringContaining(
                                    'no source in this project provides the dbt project marketing',
                                ),
                            });
                            expect(
                                await guardedState(fixture.projectUuid),
                            ).toEqual(before);
                            expect(await bindings(fixture.projectUuid)).toEqual(
                                { ledger: null },
                            );
                            expect(
                                await database(
                                    'explore_name_allocations',
                                ).where('project_uuid', fixture.projectUuid),
                            ).toEqual([]);
                        }
                        expect(await chartData()).toEqual([
                            { id: 1, amount: 17 },
                        ]);
                    } finally {
                        await warehouse.destroy();
                    }
                },
            );

            test.each([
                { explicit: false, route: 'single' },
                { explicit: true, route: 'single' },
                { explicit: false, route: 'multi' },
                { explicit: true, route: 'multi' },
            ])(
                'accepts a fresh mixed preview with each copied source owner (explicit $explicit, route $route)',
                async ({ explicit, route }) => {
                    const parent = await setup();
                    const { fixture, primary, deploy } = await setup(
                        ProjectType.PREVIEW,
                        parent.fixture.projectUuid,
                    );
                    if (route === 'multi') {
                        await database('projects')
                            .where('project_uuid', fixture.projectUuid)
                            .update({ connection_mode: 'multi' } as never);
                        await bind(
                            fixture,
                            'finance',
                            fixture.extraConnectionUuid,
                        );
                    }
                    await database('cached_explore')
                        .where('project_uuid', fixture.projectUuid)
                        .delete();
                    const orders = packagedExplore('orders', 'analytics');
                    if (route === 'single')
                        orders.tables.payments = packagedExplore(
                            'payments',
                            'finance',
                        ).tables.payments;
                    await deploy({
                        explores: [
                            orders,
                            packagedExplore('payments', 'finance'),
                        ],
                        cliDeploy: {
                            sourceUuid: explicit
                                ? fixture.sourceUuids.finance
                                : null,
                            target:
                                route === 'multi'
                                    ? { database: EXTRA_DB }
                                    : null,
                        },
                    });
                    const rows = await cachedExplores(fixture.projectUuid);
                    expect(rows.map((row) => row.name)).toEqual([
                        'orders',
                        'payments',
                    ]);
                    expect(rows[0].explore.tables?.orders.dbtSourceUuid).toBe(
                        primary.dbtSourceUuid,
                    );
                    if (route === 'single')
                        expect(
                            rows[0].explore.tables?.payments.dbtSourceUuid,
                        ).toBe(fixture.sourceUuids.finance);
                    expect(rows[1].explore.tables?.payments.dbtSourceUuid).toBe(
                        fixture.sourceUuids.finance,
                    );
                    expect(await bindings(fixture.projectUuid)).toEqual({
                        orders: null,
                        payments:
                            route === 'multi'
                                ? fixture.extraConnectionUuid
                                : null,
                    });
                },
            );

            test('accepts a fresh single-package preview using the parent ref catalog', async () => {
                const parent = await setup();
                await new DbtSourceRefCatalogModel({
                    database,
                }).upsertProvisional({
                    projectUuid: parent.fixture.projectUuid,
                    dbtSourceUuid: parent.primary.dbtSourceUuid,
                    connectionGroup: 'original',
                    projectName: 'analytics',
                    dbtVersion: '1.7.0',
                    nodes: [],
                    referencedProjects: [],
                    compileJobUuid: null,
                });
                await database('cached_explore')
                    .where('project_uuid', parent.fixture.projectUuid)
                    .delete();
                const { fixture, primary, deploy } = await setup(
                    ProjectType.PREVIEW,
                    parent.fixture.projectUuid,
                );
                await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .delete();
                await deploy();
                const rows = await cachedExplores(fixture.projectUuid);
                expect(rows).toHaveLength(1);
                expect(rows[0].explore.tables?.orders.dbtSourceUuid).toBe(
                    primary.dbtSourceUuid,
                );
            });

            test('a mapped mixed preview replaces uploaded sources and carries untouched sources', async () => {
                const { fixture, primary, deploy } = await setup(
                    ProjectType.PREVIEW,
                );
                await deploy({
                    explores: [
                        packagedExplore('orders', 'analytics'),
                        packagedExplore('payments', 'finance'),
                    ],
                });
                const rows = await cachedExplores(fixture.projectUuid);
                expect(rows.map((row) => row.name)).toEqual([
                    'campaigns',
                    'orders',
                    'payments',
                ]);
                expect(
                    rows.find((row) => row.name === 'orders')?.explore.tables
                        ?.orders.dbtSourceUuid,
                ).toBe(primary.dbtSourceUuid);
                expect(
                    rows.find((row) => row.name === 'payments')?.explore.tables
                        ?.payments.dbtSourceUuid,
                ).toBe(fixture.sourceUuids.finance);
            });

            test.each(['unstamped', 'parent'])(
                'updates legacy previews from main and preserves an untouched source (%s)',
                async (stamps) => {
                    const parent = await setup();
                    const { fixture, primary, deploy } = await setup(
                        ProjectType.PREVIEW,
                        parent.fixture.projectUuid,
                    );
                    await projectModel.saveExploresToCache(
                        fixture.projectUuid,
                        [
                            packagedExplore('orders', 'analytics'),
                            packagedExplore(
                                'campaigns',
                                'marketing',
                                stamps === 'parent'
                                    ? parent.fixture.sourceUuids.marketing
                                    : undefined,
                            ),
                            packagedExplore(
                                'payments',
                                'finance',
                                stamps === 'parent'
                                    ? parent.fixture.sourceUuids.finance
                                    : undefined,
                            ),
                        ],
                        true,
                    );
                    if (stamps === 'parent') {
                        const retainedError = {
                            ...exploreError,
                            name: 'finance_error',
                            dbtSourceUuid: parent.fixture.sourceUuids.finance,
                        };
                        await projectModel.saveExploresToCache(
                            fixture.projectUuid,
                            [retainedError],
                        );
                    }
                    await deploy();
                    const rows = await cachedExplores(fixture.projectUuid);
                    expect(rows.map((row) => row.name)).toEqual([
                        'campaigns',
                        ...(stamps === 'parent' ? ['finance_error'] : []),
                        'orders',
                        'payments',
                    ]);
                    expect(
                        rows.find((row) => row.name === 'orders')?.explore
                            .tables?.orders.dbtSourceUuid,
                    ).toBe(primary.dbtSourceUuid);
                    expect(
                        rows.find((row) => row.name === 'payments')?.explore
                            .tables?.payments.dbtSourceUuid,
                    ).toBe(fixture.sourceUuids.finance);
                    expect(
                        rows.find((row) => row.name === 'campaigns')?.explore
                            .tables?.campaigns.dbtSourceUuid,
                    ).toBe(fixture.sourceUuids.marketing);
                    if (stamps === 'parent')
                        expect(
                            rows.find((row) => row.name === 'finance_error')
                                ?.explore,
                        ).toMatchObject({
                            dbtSourceUuid: fixture.sourceUuids.finance,
                        });
                },
            );

            test.each([false, true])(
                'keeps ordinary inventory deploy rules on a preview (explicit %s)',
                async (explicit) => {
                    const { fixture, primary, deploy } = await setup(
                        ProjectType.PREVIEW,
                    );
                    const before = (
                        await cachedExplores(fixture.projectUuid)
                    ).find((row) => row.name === 'payments')?.explore;
                    const stub = {
                        ...packagedExplore('payments', 'finance'),
                        errors: exploreError.errors,
                    };
                    await deploy({
                        explores: [
                            packagedExplore('orders', 'analytics'),
                            packagedExplore('date_spine', 'dbt_utils'),
                            stub,
                        ],
                        dbtModelNames: [
                            'orders',
                            'analytics__orders',
                            'dbt_utils__date_spine',
                        ],
                        cliDeploy: {
                            sourceUuid: explicit ? primary.dbtSourceUuid : null,
                            target: null,
                        },
                    });
                    const rows = await cachedExplores(fixture.projectUuid);
                    expect(rows.map((row) => row.name)).toEqual([
                        'campaigns',
                        'date_spine',
                        'orders',
                        'payments',
                    ]);
                    expect(
                        rows.find((row) => row.name === 'payments')?.explore,
                    ).toEqual(before);
                    expect(
                        rows.find((row) => row.name === 'date_spine')?.explore
                            .tables?.date_spine.dbtSourceUuid,
                    ).toBe(primary.dbtSourceUuid);
                },
            );

            test('rejects an ordinary explicit source mismatch on a preview with no side effects', async () => {
                const { fixture, deploy } = await setup(ProjectType.PREVIEW);
                await seedGuardedState(fixture.projectUuid);
                const before = await guardedState(fixture.projectUuid);
                await expect(
                    deploy({
                        dbtModelNames: ['orders', 'analytics__orders'],
                        cliDeploy: {
                            sourceUuid: fixture.sourceUuids.finance,
                            target: null,
                        },
                    }),
                ).rejects.toMatchObject({
                    statusCode: 409,
                    message: expectedRejection(
                        'the deploy named source finance, but the uploaded explores belong to source Core models',
                    ),
                });
                expect(await guardedState(fixture.projectUuid)).toEqual(before);
            });

            test.each([false, true])(
                'rejects an unmappable preview package with no project side effects (explicit %s)',
                async (explicit) => {
                    const { fixture, deploy } = await setup(
                        ProjectType.PREVIEW,
                    );
                    await seedGuardedState(fixture.projectUuid);
                    const before = await guardedState(fixture.projectUuid);
                    await expect(
                        deploy({
                            explores: [
                                packagedExplore('orders', 'analytics'),
                                packagedExplore('new_model', 'unregistered'),
                            ],
                            cliDeploy: {
                                sourceUuid: explicit
                                    ? fixture.sourceUuids.finance
                                    : null,
                                target: null,
                            },
                        }),
                    ).rejects.toMatchObject({
                        statusCode: 409,
                        message: expectedRejection(
                            'no source in this project provides the dbt project unregistered',
                        ),
                    });
                    expect(await guardedState(fixture.projectUuid)).toEqual(
                        before,
                    );
                },
            );

            test('rejects an ambiguous preview package without changing the project', async () => {
                const { fixture, deploy } = await setup(ProjectType.PREVIEW);
                await projectModel.saveExploresToCache(fixture.projectUuid, [
                    packagedExplore(
                        'campaigns',
                        'analytics',
                        fixture.sourceUuids.marketing,
                    ),
                ]);
                await seedGuardedState(fixture.projectUuid);
                const before = await guardedState(fixture.projectUuid);
                await expect(deploy()).rejects.toMatchObject({
                    statusCode: 409,
                    message: expectedRejection(
                        'several sources (Core models, marketing) provide analytics; the preview cannot assign its models to one source',
                    ),
                });
                expect(await guardedState(fixture.projectUuid)).toEqual(before);
            });

            test.each([
                { route: 'single', explicit: false },
                { route: 'single', explicit: true },
                { route: 'multi', explicit: false },
                { route: 'multi', explicit: true },
            ])(
                'qualifies cross-source names and preserves the saved chart data ($route, explicit $explicit)',
                async ({ route, explicit }) => {
                    const { fixture, primary, deploy } = await setup();
                    if (route === 'multi') {
                        await database('projects')
                            .where('project_uuid', fixture.projectUuid)
                            .update({ connection_mode: 'multi' } as never);
                        await bind(
                            fixture,
                            'finance',
                            fixture.extraConnectionUuid,
                        );
                    }
                    const chartOwner = await seedGuardedState(
                        fixture.projectUuid,
                    );
                    const before = await guardedState(fixture.projectUuid);
                    expect(before.catalog.length).toBeGreaterThan(0);
                    expect(await chartOwner()).toBe(primary.dbtSourceUuid);
                    const warehouse = knex({
                        client: 'pg',
                        connection: {
                            ...postgresWarehouse(ORIGINAL_DB),
                            database: ORIGINAL_DB,
                        },
                    });
                    const chartData = async () => {
                        const saved = await projectModel.getExploreFromCache(
                            fixture.projectUuid,
                            'orders',
                        );
                        return (
                            await warehouse.raw(
                                `SELECT id, amount FROM ${saved.tables![saved.baseTable!].sqlTable} ORDER BY id`,
                            )
                        ).rows;
                    };
                    try {
                        await warehouse('orders').delete();
                        await warehouse('orders').insert({
                            id: 1,
                            amount: 101,
                        });
                        await database('cached_explore')
                            .where({
                                project_uuid: fixture.projectUuid,
                                name: 'orders',
                            })
                            .update({
                                explore: database.raw(
                                    "jsonb_set(explore, '{tables,orders,sqlTable}', to_jsonb(?::text))",
                                    ['"public"."orders"'],
                                ),
                            });
                        const savedData = await chartData();
                        expect(savedData).toEqual([{ id: 1, amount: 101 }]);
                        const ownerBefore =
                            await projectModel.getExploreFromCache(
                                fixture.projectUuid,
                                'orders',
                            );
                        const uploaded = [
                            packagedExplore('payments', 'finance'),
                            packagedExplore('orders', 'dbt_utils'),
                        ];
                        await deploy({
                            explores: uploaded,
                            cliDeploy: {
                                sourceUuid: explicit
                                    ? fixture.sourceUuids.finance
                                    : null,
                                target: null,
                            },
                        });
                        expect(
                            await projectModel.getExploreFromCache(
                                fixture.projectUuid,
                                'orders',
                            ),
                        ).toEqual(ownerBefore);
                        expect(await chartData()).toEqual(savedData);
                        expect(
                            uploaded.find(
                                (item) => item.name === 'finance__orders',
                            )?.warnings,
                        ).toEqual(
                            expect.arrayContaining([
                                expect.objectContaining({
                                    message: expect.stringContaining(
                                        'owned by model "orders" from source "Core models"',
                                    ),
                                }),
                            ]),
                        );
                        const after = await guardedState(fixture.projectUuid);
                        expect({ ...after, explores: before.explores }).toEqual(
                            before,
                        );
                        expect(await chartOwner()).toBe(primary.dbtSourceUuid);
                    } finally {
                        await warehouse.destroy();
                    }
                },
            );

            test.each(['owned', 'reserved'])(
                'rejects an unsafe qualified name with no project changes (%s)',
                async (kind) => {
                    const { fixture, primary, deploy } = await setup();
                    if (kind === 'owned') {
                        await projectModel.saveExploresToCache(
                            fixture.projectUuid,
                            [
                                packagedExplore(
                                    'finance__orders',
                                    'analytics',
                                    primary.dbtSourceUuid,
                                ),
                            ],
                        );
                    } else {
                        await database('explore_name_allocations').insert({
                            project_uuid: fixture.projectUuid,
                            name: 'finance__orders',
                            source_key: '__reserved__',
                            source_name: null,
                            package_name: '__reserved__',
                            model_unique_id: '__reserved__',
                            model_name: 'finance__orders',
                            is_reserved: true,
                        });
                    }
                    const chartOwner = await seedGuardedState(
                        fixture.projectUuid,
                    );
                    const before = await guardedState(fixture.projectUuid);
                    const allocationsBefore = await database(
                        'explore_name_allocations',
                    ).where('project_uuid', fixture.projectUuid);
                    await expect(
                        deploy({
                            explores: [
                                packagedExplore('payments', 'finance'),
                                packagedExplore('orders', 'dbt_utils'),
                            ],
                            cliDeploy: {
                                sourceUuid: fixture.sourceUuids.finance,
                                target: null,
                            },
                            projectConfigDefaults: { case_sensitive: true },
                        }),
                    ).rejects.toMatchObject({
                        statusCode: 409,
                        message: expect.stringContaining(
                            'cannot use explore name "finance__orders"',
                        ),
                    });
                    expect(await guardedState(fixture.projectUuid)).toEqual(
                        before,
                    );
                    expect(
                        await database('explore_name_allocations').where(
                            'project_uuid',
                            fixture.projectUuid,
                        ),
                    ).toEqual(allocationsBefore);
                    expect(await chartOwner()).toBe(primary.dbtSourceUuid);
                },
            );

            test.each([false, true])(
                'allows a same-source redeploy and removal of an omitted name (explicit %s)',
                async (explicit) => {
                    const { fixture, primary, deploy } = await setup();
                    await deploy({
                        cliDeploy: {
                            sourceUuid: explicit ? primary.dbtSourceUuid : null,
                            target: null,
                        },
                    });
                    const before = await dump(fixture.projectUuid);
                    await deploy({
                        cliDeploy: {
                            sourceUuid: explicit ? primary.dbtSourceUuid : null,
                            target: null,
                        },
                    });
                    expect(await dump(fixture.projectUuid)).toEqual(before);
                    expect(
                        Object.keys(await bindings(fixture.projectUuid)),
                    ).not.toContain('retired');
                    expect(
                        (await cachedExplores(fixture.projectUuid)).find(
                            (row) => row.name === 'orders',
                        )?.explore.tables?.orders.dbtSourceUuid,
                    ).toBe(primary.dbtSourceUuid);
                },
            );

            test('replaces only the matched source and preserves other cached explores', async () => {
                const { fixture, primary, deploy } = await setup();
                await deploy();
                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    orders: null,
                    payments: null,
                });
                const rows = await cachedExplores(fixture.projectUuid);
                expect(
                    rows.find((row) => row.name === 'orders')?.explore.tables
                        ?.orders.dbtSourceUuid,
                ).toBe(primary.dbtSourceUuid);
            });

            test('logs the inference method and the actual project explore diff', async () => {
                const { deploy, service } = await setup();
                const info = vi.spyOn(
                    (service as unknown as { logger: typeof Logger }).logger,
                    'info',
                );
                try {
                    await deploy();
                    expect(info).toHaveBeenCalledWith(
                        'cli.deploy.source_inferred',
                        expect.objectContaining({
                            method: 'package_match',
                            uploadedExploreCount: 1,
                            droppedExploreCount: 0,
                        }),
                    );
                    expect(info).toHaveBeenCalledWith(
                        'compile.completed',
                        expect.objectContaining({
                            newExploreCount: 3,
                            removedExploreCount: 1,
                            removedExploreNames: ['retired'],
                        }),
                    );
                } finally {
                    info.mockRestore();
                }
            });

            test.each(['single', 'multi'] as const)(
                'infers an extra source on a %s connection project',
                async (route) => {
                    const { fixture, deploy } = await setup();
                    if (route === 'multi') {
                        await database('projects')
                            .where('project_uuid', fixture.projectUuid)
                            .update({ connection_mode: 'multi' } as never);
                        await bind(
                            fixture,
                            'finance',
                            fixture.extraConnectionUuid,
                        );
                    }
                    await deploy({
                        explores: [packagedExplore('payments', 'finance')],
                    });
                    expect(await bindings(fixture.projectUuid)).toEqual({
                        campaigns: null,
                        orders: null,
                        payments:
                            route === 'multi'
                                ? fixture.extraConnectionUuid
                                : null,
                        retired: null,
                    });
                    expect(
                        (await cachedExplores(fixture.projectUuid)).find(
                            (row) => row.name === 'payments',
                        )?.explore.tables?.payments.dbtSourceUuid,
                    ).toBe(fixture.sourceUuids.finance);
                },
            );

            test.each([false, true])(
                'rejects missing cached source stamps before any deletion (explicit %s)',
                async (explicit) => {
                    const { fixture, primary, deploy } = await setup();
                    await database('cached_explore')
                        .where('project_uuid', fixture.projectUuid)
                        .where('name', 'campaigns')
                        .update({
                            explore: JSON.stringify(
                                packagedExplore('campaigns', 'marketing'),
                            ),
                        });
                    const before = await dump(fixture.projectUuid);
                    await expect(
                        deploy({
                            cliDeploy: {
                                sourceUuid: explicit
                                    ? primary.dbtSourceUuid
                                    : null,
                                target: null,
                            },
                        }),
                    ).rejects.toMatchObject({
                        statusCode: 409,
                        message: expectedRejection(
                            'the saved explores do not identify their dbt source; refresh the project in Lightdash',
                        ),
                    });
                    expect(await dump(fixture.projectUuid)).toEqual(before);
                },
            );

            test.each([
                { change: 'unstamped', explicit: false, preview: false },
                { change: 'name-collision', explicit: false, preview: false },
                { change: 'unstamped', explicit: true, preview: false },
                { change: 'unstamped', explicit: false, preview: true },
                { change: 'unstamped', explicit: true, preview: true },
                { change: 'name-collision', explicit: true, preview: false },
                { change: 'name-collision', explicit: false, preview: true },
                { change: 'name-collision', explicit: true, preview: true },
            ])(
                'rejects ownership changes before publication ($change, explicit $explicit, preview $preview)',
                async ({ change, explicit, preview }) => {
                    const { fixture, primary, deploy } = await setup(
                        preview ? ProjectType.PREVIEW : ProjectType.DEFAULT,
                    );
                    const chartOwner = await seedGuardedState(
                        fixture.projectUuid,
                    );
                    const upload = packagedExplore('orders', 'analytics');
                    if (explicit && !preview)
                        delete upload.tables.orders.dbtPackageName;
                    if (change === 'name-collision') {
                        await projectModel.saveExploresToCache(
                            fixture.projectUuid,
                            [
                                packagedExplore(
                                    'Core models__orders',
                                    'marketing',
                                    fixture.sourceUuids.marketing,
                                ),
                            ],
                        );
                    }
                    const save =
                        projectModel.saveMultiConnectionExplores.bind(
                            projectModel,
                        );
                    const changed =
                        change === 'unstamped'
                            ? packagedExplore(
                                  'new_upstream',
                                  preview ? 'unregistered' : 'marketing',
                              )
                            : packagedExplore(
                                  'orders',
                                  'marketing',
                                  fixture.sourceUuids.marketing,
                              );
                    let before:
                        | Awaited<ReturnType<typeof guardedState>>
                        | undefined;
                    const intercepted = vi
                        .spyOn(projectModel, 'saveMultiConnectionExplores')
                        .mockImplementationOnce(async (...args) => {
                            await projectModel.saveExploresToCache(
                                fixture.projectUuid,
                                [changed],
                            );
                            before = await guardedState(fixture.projectUuid);
                            return save(...args);
                        });
                    try {
                        await expect(
                            deploy({
                                explores: [upload],
                                cliDeploy: {
                                    sourceUuid: explicit
                                        ? primary.dbtSourceUuid
                                        : null,
                                    target: null,
                                },
                            }),
                        ).rejects.toMatchObject({
                            statusCode: 409,
                            message:
                                change === 'name-collision'
                                    ? expect.stringContaining(
                                          'cannot use explore name "Core models__orders"',
                                      )
                                    : expectedRejection(
                                          change === 'name-collision'
                                              ? 'another deploy or refresh changed the project while this deploy ran; the upload would replace explores owned by another source: orders (source marketing); deploy again'
                                              : 'another deploy or refresh changed the project while this deploy ran; deploy again',
                                      ),
                        });
                        expect(await guardedState(fixture.projectUuid)).toEqual(
                            before,
                        );
                        expect(await chartOwner()).toBe(
                            change === 'name-collision'
                                ? fixture.sourceUuids.marketing
                                : primary.dbtSourceUuid,
                        );
                    } finally {
                        intercepted.mockRestore();
                    }
                },
            );

            test.each([false, true])(
                'ignores an installed package when choosing the source (explicit %s)',
                async (explicit) => {
                    const { fixture, primary, deploy } = await setup();
                    await deploy({
                        cliDeploy: {
                            sourceUuid: explicit ? primary.dbtSourceUuid : null,
                            target: null,
                        },
                        explores: [
                            packagedExplore('orders', 'analytics'),
                            packagedExplore('date_spine', 'dbt_utils'),
                        ],
                    });
                    expect(
                        Object.keys(await bindings(fixture.projectUuid)),
                    ).toEqual([
                        'campaigns',
                        'date_spine',
                        'orders',
                        'payments',
                    ]);
                },
            );

            test('resolves duplicate package names by uploaded name overlap', async () => {
                const { fixture, deploy } = await setup();
                await projectModel.saveExploresToCache(fixture.projectUuid, [
                    packagedExplore(
                        'campaigns',
                        'analytics',
                        fixture.sourceUuids.marketing,
                    ),
                ]);
                await deploy();
                expect(
                    Object.keys(await bindings(fixture.projectUuid)),
                ).toEqual(['campaigns', 'orders', 'payments']);
            });

            test.each([
                'ambiguous',
                'ambiguous-target',
                'missing-project-name',
                'contradictory-database',
                'multiple-databases',
                'unmapped',
                'empty',
                'errors-only',
                'contradictory-model-names',
                'multiple-root-packages',
            ])('rejects %s without project changes', async (kind) => {
                const { fixture, deploy } = await setup();
                await database('project_parameters').insert({
                    project_uuid: fixture.projectUuid,
                    name: 'minimum_amount',
                    config: {
                        label: 'Minimum amount',
                        type: 'number',
                        default: 5,
                    },
                });
                await database('tags').insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Payments',
                    color: 'blue',
                    yaml_reference: 'payments',
                    created_by_user_uuid: null,
                });
                if (
                    [
                        'ambiguous',
                        'ambiguous-target',
                        'contradictory-database',
                        'multiple-databases',
                    ].includes(kind)
                ) {
                    await projectModel.saveExploresToCache(
                        fixture.projectUuid,
                        [
                            packagedExplore(
                                'campaigns',
                                'analytics',
                                fixture.sourceUuids.marketing,
                            ),
                        ],
                    );
                }
                const projectState = async () => ({
                    explores: await dump(fixture.projectUuid),
                    parameters: await database('project_parameters')
                        .where('project_uuid', fixture.projectUuid)
                        .orderBy('name'),
                    tags: await database('tags')
                        .where('project_uuid', fixture.projectUuid)
                        .orderBy('name'),
                });
                const before = await projectState();
                let explores: (Explore | ExploreError)[] = [
                    packagedExplore(
                        [
                            'ambiguous',
                            'ambiguous-target',
                            'contradictory-database',
                            'multiple-databases',
                        ].includes(kind)
                            ? 'new_model'
                            : 'orders',
                        kind === 'unmapped' ? 'unknown' : 'analytics',
                    ),
                ];
                if (kind === 'empty') explores = [];
                else if (kind === 'errors-only') explores = [exploreError];
                else if (kind === 'multiple-root-packages')
                    explores = [
                        packagedExplore('orders', 'analytics'),
                        packagedExplore('campaigns', 'marketing'),
                    ];
                if (kind === 'missing-project-name')
                    delete explores[0].tables!.orders.dbtPackageName;
                if (kind === 'contradictory-database')
                    explores[0].tables!.new_model.database = ORIGINAL_DB;
                if (kind === 'multiple-databases') {
                    const other = packagedExplore('another_model', 'analytics');
                    other.tables.another_model.database = 'other_database';
                    explores.push(other);
                }
                const reasons: Record<string, string> = {
                    ambiguous:
                        'sources Core models and marketing both provide analytics, and the deploy did not send a dbt target database',
                    'ambiguous-target':
                        'sources Core models and marketing both provide analytics, and the dbt target database unmatched_database does not pick one',
                    'missing-project-name':
                        'the uploaded explores carry no dbt project name; update the Lightdash CLI',
                    unmapped:
                        'no source in this project provides the dbt project unknown',
                    empty: 'the upload contains no explores; compile the dbt project and deploy again',
                    'errors-only':
                        'none of the uploaded explores compiled successfully; fix the compile errors and deploy again',
                    'contradictory-model-names':
                        'the explores and the model list disagree; run the deploy again',
                    'multiple-root-packages':
                        'the upload contains models from several sources (analytics, marketing)',
                    'contradictory-database':
                        'the explores and the dbt target name different databases; run the deploy again',
                    'multiple-databases':
                        'the uploaded explores name several databases; run the deploy again',
                };
                if (kind === 'ambiguous-target')
                    explores[0].tables!.new_model.database =
                        'unmatched_database';
                await expect(
                    deploy({
                        explores,
                        ...([
                            'ambiguous-target',
                            'contradictory-database',
                        ].includes(kind)
                            ? {
                                  cliDeploy: {
                                      sourceUuid: null,
                                      target: {
                                          database: 'unmatched_database',
                                      },
                                  },
                              }
                            : {}),
                        ...(kind === 'contradictory-model-names'
                            ? { dbtModelNames: ['other__orders'] }
                            : {}),
                    }),
                ).rejects.toMatchObject({
                    statusCode: 409,
                    message: expectedRejection(reasons[kind]),
                });
                expect(await projectState()).toEqual(before);
            });

            test.each([false, true])(
                'resolves a duplicate package by database with target %s',
                async (withTarget) => {
                    const { fixture, deploy } = await setup();
                    await projectModel.saveExploresToCache(
                        fixture.projectUuid,
                        [
                            packagedExplore(
                                'campaigns',
                                'analytics',
                                fixture.sourceUuids.marketing,
                            ),
                        ],
                    );
                    await projectDbtSourcesModel.updateSource(
                        fixture.sourceUuids.marketing,
                        {
                            warehouseLocation: {
                                database: 'marketing_database',
                                schema: null,
                            },
                        },
                    );
                    const upload = packagedExplore('new_model', 'analytics');
                    upload.tables.new_model.database = ORIGINAL_DB;
                    await deploy({
                        explores: [upload],
                        cliDeploy: {
                            sourceUuid: null,
                            target: withTarget
                                ? { database: ORIGINAL_DB }
                                : null,
                        },
                    });
                    expect(
                        Object.keys(await bindings(fixture.projectUuid)),
                    ).toEqual(['campaigns', 'new_model', 'payments']);
                },
            );

            test('falls back to catalog project names when cached packages are absent', async () => {
                const { fixture, primary, deploy } = await setup();
                await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .whereIn('name', ['orders', 'retired'])
                    .update({
                        explore: database.raw(
                            "explore #- '{tables,orders,dbtPackageName}' #- '{tables,retired,dbtPackageName}'",
                        ),
                    });
                await new DbtSourceRefCatalogModel({
                    database,
                }).upsertProvisional({
                    projectUuid: fixture.projectUuid,
                    dbtSourceUuid: primary.dbtSourceUuid,
                    connectionGroup: 'original',
                    projectName: 'analytics',
                    dbtVersion: '1.7.0',
                    nodes: [],
                    referencedProjects: [],
                    compileJobUuid: null,
                });
                await deploy();
                expect(
                    Object.keys(await bindings(fixture.projectUuid)),
                ).toEqual(['campaigns', 'orders', 'payments']);
            });

            test('drops upstream error stubs using the base table package only', async () => {
                const { fixture, deploy } = await setup();
                const upload = packagedExplore('orders', 'analytics');
                upload.tables.payments = packagedExplore(
                    'payments',
                    'finance',
                ).tables.payments;
                const stub = {
                    ...packagedExplore('payments', 'finance'),
                    errors: exploreError.errors,
                };
                await deploy({ explores: [upload, stub] });
                const rows = await cachedExplores(fixture.projectUuid);
                expect(rows.map((row) => row.name)).toEqual([
                    'campaigns',
                    'orders',
                    'payments',
                ]);
                expect(
                    rows.find((row) => row.name === 'payments')?.explore,
                ).toEqual(
                    packagedExplore(
                        'payments',
                        'finance',
                        fixture.sourceUuids.finance,
                    ),
                );
            });

            test.each([false, undefined])(
                'keeps merge behaviour with complete %s',
                async (complete) => {
                    const { fixture, deploy } = await setup();
                    await deploy({
                        complete,
                        explores: [packagedExplore('new_model', 'unknown')],
                    });
                    expect(
                        Object.keys(await bindings(fixture.projectUuid)),
                    ).toEqual([
                        'campaigns',
                        'new_model',
                        'orders',
                        'payments',
                        'retired',
                    ]);
                },
            );

            test('keeps single-source complete replacement unchanged', async () => {
                const { fixture, deploy } = await setup();
                await database('project_dbt_sources')
                    .where('project_uuid', fixture.projectUuid)
                    .delete();
                const upload = packagedExplore('orders', 'unknown');
                await deploy({ explores: [upload] });
                expect(
                    (await cachedExplores(fixture.projectUuid)).map(
                        (row) => row.explore,
                    ),
                ).toEqual([upload]);
            });

            test('accepts a fresh single-source project without any saved source mapping', async () => {
                const { fixture, deploy } = await setup();
                await database('project_dbt_sources')
                    .where('project_uuid', fixture.projectUuid)
                    .delete();
                await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .delete();
                await database('dbt_source_ref_catalogs')
                    .where('project_uuid', fixture.projectUuid)
                    .delete();
                const upload = packagedExplore('orders', 'unknown');

                await deploy({ explores: [upload] });

                expect(
                    (await cachedExplores(fixture.projectUuid)).map(
                        (row) => row.explore,
                    ),
                ).toEqual([upload]);
            });

            describe('single connection without extra warehouse rows', () => {
                const setupSingle = async () => {
                    const result = await setup();
                    await database('warehouse_connections')
                        .where('project_uuid', result.fixture.projectUuid)
                        .where('is_original', false)
                        .delete();
                    expect(
                        await projectModel.getConnectionRoute(
                            result.fixture.projectUuid,
                            { kind: 'original' },
                        ),
                    ).toBe('single');
                    expect(
                        await database('warehouse_connections')
                            .where('project_uuid', result.fixture.projectUuid)
                            .where('is_original', false),
                    ).toEqual([]);
                    return result;
                };

                test.each([false, true])(
                    'keeps other sources when explicit is %s',
                    async (explicit) => {
                        const { fixture, primary, deploy } =
                            await setupSingle();
                        await deploy({
                            cliDeploy: {
                                sourceUuid: explicit
                                    ? primary.dbtSourceUuid
                                    : null,
                                target: null,
                            },
                        });
                        expect(
                            Object.keys(await bindings(fixture.projectUuid)),
                        ).toEqual(['campaigns', 'orders', 'payments']);
                        expect(
                            (await cachedExplores(fixture.projectUuid)).find(
                                (row) => row.name === 'orders',
                            )?.explore.tables?.orders.dbtSourceUuid,
                        ).toBe(primary.dbtSourceUuid);
                    },
                );

                test('rejects an explicit source that disagrees with inference', async () => {
                    const { fixture, deploy } = await setupSingle();
                    const before = await dump(fixture.projectUuid);
                    await expect(
                        deploy({
                            cliDeploy: {
                                sourceUuid: fixture.sourceUuids.marketing,
                                target: null,
                            },
                        }),
                    ).rejects.toMatchObject({
                        statusCode: 409,
                        message: expectedRejection(
                            'the deploy named source marketing, but the uploaded explores belong to source Core models',
                        ),
                    });
                    expect(await dump(fixture.projectUuid)).toEqual(before);
                });

                test.each([
                    'missing-package',
                    'unmapped',
                    'ambiguous',
                    'model-list',
                ])(
                    'uses a valid explicit source when inference is %s',
                    async (kind) => {
                        const { fixture, primary, deploy } =
                            await setupSingle();
                        const upload = packagedExplore(
                            'orders',
                            kind === 'unmapped' ? 'unknown' : 'analytics',
                        );
                        if (kind === 'missing-package')
                            delete upload.tables.orders.dbtPackageName;
                        if (kind === 'ambiguous') {
                            await projectModel.saveExploresToCache(
                                fixture.projectUuid,
                                [
                                    packagedExplore(
                                        'campaigns',
                                        'analytics',
                                        fixture.sourceUuids.marketing,
                                    ),
                                ],
                            );
                            upload.name = 'new_model';
                        }
                        await deploy({
                            explores: [upload],
                            dbtModelNames:
                                kind === 'model-list'
                                    ? ['other__orders']
                                    : undefined,
                            cliDeploy: {
                                sourceUuid: primary.dbtSourceUuid,
                                target: null,
                            },
                        });
                        expect(
                            Object.keys(await bindings(fixture.projectUuid)),
                        ).toEqual([
                            'campaigns',
                            kind === 'ambiguous' ? 'new_model' : 'orders',
                            'payments',
                        ]);
                    },
                );

                test('uses an extra explicit source without usable package evidence', async () => {
                    const { fixture, deploy } = await setupSingle();
                    await deploy({
                        explores: [packagedExplore('new_campaigns', 'unknown')],
                        cliDeploy: {
                            sourceUuid: fixture.sourceUuids.marketing,
                            target: null,
                        },
                    });
                    const rows = await cachedExplores(fixture.projectUuid);
                    expect(rows.map((row) => row.name)).toEqual([
                        'new_campaigns',
                        'orders',
                        'payments',
                        'retired',
                    ]);
                    expect(
                        rows[0].explore.tables?.new_campaigns.dbtSourceUuid,
                    ).toBe(fixture.sourceUuids.marketing);
                });

                test.each([false, true])(
                    'keeps plain replacement without extra sources, explicit %s',
                    async (explicit) => {
                        const { fixture, primary, deploy } =
                            await setupSingle();
                        await database('project_dbt_sources')
                            .where('project_uuid', fixture.projectUuid)
                            .delete();
                        const upload = packagedExplore('orders', 'unknown');
                        await deploy({
                            explores: [upload],
                            cliDeploy: {
                                sourceUuid: explicit
                                    ? primary.dbtSourceUuid
                                    : null,
                                target: null,
                            },
                        });
                        expect(
                            (await cachedExplores(fixture.projectUuid)).map(
                                (row) => row.explore,
                            ),
                        ).toEqual([upload]);
                    },
                );

                test('rejects a nonempty upload that would clear the explicit source after filtering', async () => {
                    const { fixture, deploy } = await setupSingle();
                    const before = await dump(fixture.projectUuid);
                    await expect(
                        deploy({
                            dbtModelNames: ['other__orders'],
                            cliDeploy: {
                                sourceUuid: fixture.sourceUuids.marketing,
                                target: null,
                            },
                        }),
                    ).rejects.toMatchObject({
                        statusCode: 409,
                        message: expectedRejection(
                            'the upload contains no models for source marketing',
                        ),
                    });
                    expect(await dump(fixture.projectUuid)).toEqual(before);
                });

                test('rejects a source outside this project with 400', async () => {
                    const { fixture, deploy } = await setupSingle();
                    const before = await dump(fixture.projectUuid);
                    await expect(
                        deploy({
                            cliDeploy: {
                                sourceUuid: randomUUID(),
                                target: null,
                            },
                        }),
                    ).rejects.toMatchObject({
                        statusCode: 400,
                        message:
                            'The selected dbt source does not belong to this project.',
                    });
                    expect(await dump(fixture.projectUuid)).toEqual(before);
                });
            });
        });

        describe('peer compile publication generations', () => {
            const options = (enabled = true): CompileServiceOptions => ({
                ...defaultCompileServiceOptions,
                peerDbtSources: enabled,
            });
            const deferred = () => {
                let resolve!: () => void;
                const promise = new Promise<void>((done) => {
                    resolve = done;
                });
                return { promise, resolve };
            };
            const sourceExplore = (name: string, source: string) => {
                const result = explore(name, [name]);
                result.tables[name].dbtPackageName = source;
                return result;
            };
            const deploy = (
                service: ProjectService,
                fixture: Fixture,
                userUuid: string,
                source: string,
                name: string,
                peerCompileSlices?: Awaited<
                    ReturnType<ProjectService['capturePeerCompileSlices']>
                >,
            ) =>
                service.saveDeployExplores({
                    userUuid,
                    projectUuid: fixture.projectUuid,
                    explores: [sourceExplore(name, source)],
                    compilationSource: 'cli_deploy',
                    jobUuid: null,
                    requestMethod: 'cli',
                    complete: true,
                    cliDeploy: {
                        sourceUuid: fixture.sourceUuids[source],
                        target: null,
                    },
                    ...(peerCompileSlices === undefined
                        ? {}
                        : { peerCompileSlices }),
                });
            const publicationState = async (projectUuid: string) => ({
                explores: await dump(projectUuid),
                allocations: await database('explore_name_allocations')
                    .where('project_uuid', projectUuid)
                    .orderBy('name'),
                pins: await database('project_compile_pins')
                    .where('project_uuid', projectUuid)
                    .orderBy('compile_job_uuid'),
                slices: await database('project_source_generations')
                    .where('project_uuid', projectUuid)
                    .orderBy('source_uuid'),
                generations: await database(
                    'project_catalogue_generations',
                ).where('project_uuid', projectUuid),
                refCatalogs: await database('dbt_source_ref_catalogs')
                    .where('project_uuid', projectUuid)
                    .orderBy('dbt_source_uuid')
                    .orderBy('connection_group'),
            });

            test('a refresh with project parameters publishes once and completes', async () => {
                const fixture = await createProject();
                const dbtProjectDir = mkdtempSync(
                    path.join(tmpdir(), 'peer-compile-config-'),
                );
                writeFileSync(
                    path.join(dbtProjectDir, 'lightdash.config.yml'),
                    'parameters:\n  minimum_amount:\n    label: Minimum amount\n    type: number\n    default: 7\n    allow_custom_values: true\n',
                );
                try {
                    const { service } = compileService(fixture.projectUuid, {
                        ...options(),
                        dbtProjectDir,
                    });
                    const user = await compilingUser(fixture.projectUuid);
                    const jobUuid = await createJob(
                        fixture.projectUuid,
                        user.userUuid,
                    );
                    await service.compileProject(
                        user,
                        fixture.projectUuid,
                        RequestMethod.WEB_APP,
                        jobUuid,
                    );
                    expect(
                        (await new JobModel({ database }).get(jobUuid))
                            .jobStatus,
                    ).toBe(JobStatusType.DONE);
                    const state = await publicationState(fixture.projectUuid);
                    expect(state.pins).toHaveLength(1);
                    expect(Number(state.generations[0].generation)).toBe(1);
                    expect(
                        await database('project_parameters')
                            .where('project_uuid', fixture.projectUuid)
                            .select('name', 'config'),
                    ).toEqual([
                        {
                            name: 'minimum_amount',
                            config: {
                                label: 'Minimum amount',
                                type: 'number',
                                default: 7,
                                allow_custom_values: true,
                            },
                        },
                    ]);
                } finally {
                    rmSync(dbtProjectDir, { recursive: true, force: true });
                }
            });

            test.each([false, true])(
                'an older deploy finishing last preserves flag compatibility (peer flag %s)',
                async (enabled) => {
                    const fixture = await createProject();
                    await compile(fixture);
                    const user = await compilingUser(fixture.projectUuid);
                    const older = compileService(
                        fixture.projectUuid,
                        options(enabled),
                    );
                    const newer = compileService(
                        fixture.projectUuid,
                        options(enabled),
                    );
                    const reached = deferred();
                    const release = deferred();
                    const prepare =
                        older.internals.multiConnectionCompiler.prepareSourceDeploy.bind(
                            older.internals.multiConnectionCompiler,
                        );
                    vi.spyOn(
                        older.internals.multiConnectionCompiler,
                        'prepareSourceDeploy',
                    ).mockImplementationOnce(async (...args) => {
                        const prepared = await prepare(...args);
                        reached.resolve();
                        await release.promise;
                        return prepared;
                    });
                    const oldPublish = deploy(
                        older.service,
                        fixture,
                        user.userUuid,
                        'finance',
                        'model_old',
                    );
                    try {
                        await reached.promise;
                        await deploy(
                            newer.service,
                            fixture,
                            user.userUuid,
                            'finance',
                            'model_new',
                        );
                        const newerState = await publicationState(
                            fixture.projectUuid,
                        );
                        release.resolve();
                        if (enabled) {
                            await expect(oldPublish).rejects.toThrow(
                                'A newer deploy or refresh of source finance was published while this one ran, so nothing was changed. Run it again if you still need it.',
                            );
                            expect(
                                await publicationState(fixture.projectUuid),
                            ).toEqual(newerState);
                            expect(newerState.pins).toHaveLength(1);
                            expect(newerState.pins[0].pins).toEqual([
                                expect.objectContaining({
                                    sourceUuid: fixture.sourceUuids.finance,
                                    commitSha: null,
                                    dbtProjectName: 'finance',
                                    deployMetadata: {
                                        userUuid: user.userUuid,
                                        requestMethod: 'cli',
                                        compilationSource: 'cli_deploy',
                                    },
                                }),
                            ]);
                        } else {
                            await oldPublish;
                            expect(
                                Object.keys(
                                    await bindings(fixture.projectUuid),
                                ),
                            ).toContain('model_old');
                            expect(
                                Object.keys(
                                    await bindings(fixture.projectUuid),
                                ),
                            ).not.toContain('model_new');
                            const state = await publicationState(
                                fixture.projectUuid,
                            );
                            expect(state.pins).toEqual([]);
                            expect(state.slices).toEqual([]);
                            expect(state.generations).toEqual([]);
                        }
                    } finally {
                        release.resolve();
                        await oldPublish.catch(() => {});
                    }
                },
            );

            test('two peers captured before either publication can both deploy', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const first = compileService(
                    fixture.projectUuid,
                    options(),
                ).service;
                const second = compileService(
                    fixture.projectUuid,
                    options(),
                ).service;
                const [firstSlices, secondSlices] = await Promise.all([
                    first.capturePeerCompileSlices(fixture.projectUuid),
                    second.capturePeerCompileSlices(fixture.projectUuid),
                ]);
                await Promise.all([
                    deploy(
                        first,
                        fixture,
                        user.userUuid,
                        'finance',
                        'model_a',
                        firstSlices,
                    ),
                    deploy(
                        second,
                        fixture,
                        user.userUuid,
                        'marketing',
                        'model_b',
                        secondSlices,
                    ),
                ]);
                expect(await bindings(fixture.projectUuid)).toMatchObject({
                    model_a: fixture.extraConnectionUuid,
                    model_b: null,
                });
                const state = await publicationState(fixture.projectUuid);
                expect(state.pins).toHaveLength(2);
                expect(state.slices).toHaveLength(2);
                expect(Number(state.generations[0].generation)).toBe(2);
            });

            test('a batched deploy captures its slices at session start and rejects stale finalization', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const projectService = compileService(
                    fixture.projectUuid,
                    options(),
                ).service;
                const sessionModel = new DeploySessionModel(database);
                const service = new DeployService({
                    deploySessionModel: sessionModel,
                    projectModel,
                    projectService,
                    schedulerClient: {
                        generateValidation: async () => {},
                    } as never,
                });
                const { deploySessionUuid } = await service.startDeploySession(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                );
                expect(
                    await sessionModel.getPeerCompileSlices(deploySessionUuid),
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            sourceUuid: fixture.sourceUuids.finance,
                            generation: 0,
                        }),
                    ]),
                );
                await service.addDeployBatch(
                    user,
                    fixture.projectUuid,
                    deploySessionUuid,
                    [sourceExplore('model_old', 'finance')],
                    0,
                    true,
                );
                await deploy(
                    projectService,
                    fixture,
                    user.userUuid,
                    'finance',
                    'model_new',
                );
                const before = await publicationState(fixture.projectUuid);
                await expect(
                    service.finalizeDeploy(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        'cli-1',
                        undefined,
                        {
                            sourceUuid: fixture.sourceUuids.finance,
                            target: null,
                        },
                    ),
                ).rejects.toThrow(
                    'A newer deploy or refresh of source finance was published while this one ran, so nothing was changed. Run it again if you still need it.',
                );
                expect(await publicationState(fixture.projectUuid)).toEqual(
                    before,
                );
                expect(
                    (await sessionModel.getSession(deploySessionUuid)).status,
                ).toBe(DeploySessionStatus.FAILED);
            });

            test('a legacy partial deploy records its cached source owner without changing peer routing', async () => {
                const fixture = await createProject();
                await routeSingle(fixture.projectUuid);
                const primary = await projectModel.getDbtSourceIdentity(
                    fixture.projectUuid,
                );
                const original = sourceExplore('model_a', 'primary');
                original.tables.model_a.dbtSourceUuid = primary.dbtSourceUuid;
                const peer = sourceExplore('model_b', 'finance');
                peer.tables.model_b.dbtSourceUuid = fixture.sourceUuids.finance;
                const untouched = sourceExplore('model_c', 'marketing');
                untouched.tables.model_c.dbtSourceUuid =
                    fixture.sourceUuids.marketing;
                await projectModel.saveExploresToCache(
                    fixture.projectUuid,
                    [original, peer, untouched],
                    true,
                );
                expect(
                    await projectModel.hasExploreNameAllocations(
                        fixture.projectUuid,
                    ),
                ).toBe(false);
                const before = await dump(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);
                const { service, internals } = compileService(
                    fixture.projectUuid,
                    options(),
                );
                const prepare = vi.spyOn(
                    internals.multiConnectionCompiler,
                    'prepareSourceDeploy',
                );
                const uploaded = sourceExplore('model_b', 'finance');
                uploaded.label = 'Updated model';
                await service.saveDeployExplores({
                    userUuid: user.userUuid,
                    projectUuid: fixture.projectUuid,
                    explores: [uploaded],
                    compilationSource: 'cli_deploy',
                    jobUuid: null,
                    requestMethod: 'cli',
                    complete: false,
                    cliDeploy: { sourceUuid: null, target: null },
                });
                expect(prepare).not.toHaveBeenCalled();
                const state = await publicationState(fixture.projectUuid);
                expect(
                    state.explores.filter(({ name }) => name !== 'model_b'),
                ).toEqual(before.filter(({ name }) => name !== 'model_b'));
                expect(
                    state.explores.find(({ name }) => name === 'model_b')
                        ?.explore.label,
                ).toBe('Updated model');
                expect(state.allocations).toEqual([]);
                expect(state.pins).toHaveLength(1);
                expect(state.pins[0].pins).toEqual([
                    expect.objectContaining({
                        sourceUuid: fixture.sourceUuids.finance,
                        commitSha: null,
                        dbtProjectName: 'finance',
                        deployMetadata: {
                            userUuid: user.userUuid,
                            requestMethod: 'cli',
                            compilationSource: 'cli_deploy',
                        },
                    }),
                ]);
                expect(state.slices).toHaveLength(3);
                expect(
                    state.slices.every(
                        ({ generation }) => Number(generation) === 1,
                    ),
                ).toBe(true);
            });

            test('turning the peer flag off after a batched snapshot restores last-writer-wins without metadata writes', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const mutableOptions = options();
                const projectService = compileService(
                    fixture.projectUuid,
                    mutableOptions,
                ).service;
                const sessionModel = new DeploySessionModel(database);
                const service = new DeployService({
                    deploySessionModel: sessionModel,
                    projectModel,
                    projectService,
                    schedulerClient: {
                        generateValidation: async () => {},
                    } as never,
                });
                const { deploySessionUuid } = await service.startDeploySession(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                );
                expect(
                    await sessionModel.getPeerCompileSlices(deploySessionUuid),
                ).not.toBeNull();
                await service.addDeployBatch(
                    user,
                    fixture.projectUuid,
                    deploySessionUuid,
                    [sourceExplore('model_old', 'finance')],
                    0,
                    true,
                );
                mutableOptions.peerDbtSources = false;
                await deploy(
                    projectService,
                    fixture,
                    user.userUuid,
                    'finance',
                    'model_new',
                );
                const result = await service.finalizeDeploy(
                    user,
                    fixture.projectUuid,
                    deploySessionUuid,
                    'cli-1',
                    undefined,
                    { sourceUuid: fixture.sourceUuids.finance, target: null },
                );
                expect(result.status).toBe(DeploySessionStatus.COMPLETED);
                const state = await publicationState(fixture.projectUuid);
                expect(state.explores.map(({ name }) => name)).toContain(
                    'model_old',
                );
                expect(state.explores.map(({ name }) => name)).not.toContain(
                    'model_new',
                );
                expect(state.pins).toEqual([]);
                expect(state.slices).toEqual([]);
                expect(state.generations).toEqual([]);
            });

            test('turning the peer flag off during a single-connection refresh still publishes its manifest and ref catalogs', async () => {
                const fixture = await createProject();
                await routeSingle(fixture.projectUuid);
                const stale = dbtManifest('project_a', [
                    {
                        name: 'model_stale',
                        database: ORIGINAL_DB,
                        table: 'orders',
                    },
                ]);
                await projectModel.upsertMergedManifest(
                    fixture.projectUuid,
                    gzipSync(JSON.stringify(stale)),
                );
                await projectModel.saveExploresToCache(
                    fixture.projectUuid,
                    [explore('model_stale', ['orders'])],
                    true,
                );
                const user = await compilingUser(fixture.projectUuid);
                const mutableOptions = options();
                const { service } = compileService(
                    fixture.projectUuid,
                    mutableOptions,
                );
                const reached = deferred();
                const release = deferred();
                const save =
                    projectModel.saveMultiConnectionExplores.bind(projectModel);
                vi.spyOn(
                    projectModel,
                    'saveMultiConnectionExplores',
                ).mockImplementationOnce(async (...args) => {
                    reached.resolve();
                    await release.promise;
                    return save(...args);
                });
                const jobUuid = await createJob(
                    fixture.projectUuid,
                    user.userUuid,
                );
                const refresh = service.compileProject(
                    user,
                    fixture.projectUuid,
                    RequestMethod.WEB_APP,
                    jobUuid,
                );
                try {
                    await reached.promise;
                    mutableOptions.peerDbtSources = false;
                    release.resolve();
                    await refresh;
                    expect(
                        (await new JobModel({ database }).get(jobUuid))
                            .jobStatus,
                    ).toBe(JobStatusType.DONE);
                    const state = await publicationState(fixture.projectUuid);
                    expect(state.explores.map(({ name }) => name)).toEqual([
                        'campaigns',
                        'customers',
                        'orders',
                        'payments',
                    ]);
                    const serialized = gunzipSync(
                        await projectModel.getMergedManifest(
                            fixture.projectUuid,
                        ),
                    ).toString();
                    let merged: DbtManifest;
                    try {
                        merged = JSON.parse(serialized) as DbtManifest;
                    } catch (error) {
                        throw new Error(
                            'The published merged manifest is invalid',
                            { cause: error },
                        );
                    }
                    expect(Object.keys(merged.nodes).sort()).toEqual([
                        'model.finance.payments',
                        'model.marketing.campaigns',
                        'model.primary.customers',
                        'model.primary.orders',
                    ]);
                    expect(state.refCatalogs).toHaveLength(3);
                    expect(
                        state.refCatalogs.every(
                            ({ status }) => status === 'confirmed',
                        ),
                    ).toBe(true);
                    expect(state.pins).toEqual([]);
                    expect(state.slices).toEqual([]);
                    expect(state.generations).toEqual([]);
                } finally {
                    release.resolve();
                    await refresh.catch(() => {});
                }
            });

            test.each([
                'enabled',
                'disabled before finalize',
                'disabled during prepare',
            ] as const)(
                'a deploy of a peer added after its stored snapshot respects the current flag (%s)',
                async (mode) => {
                    const fixture = await createProject();
                    await compile(fixture);
                    const user = await compilingUser(fixture.projectUuid);
                    const mutableOptions = options();
                    const { service, internals } = compileService(
                        fixture.projectUuid,
                        mutableOptions,
                    );
                    const snapshot = await service.capturePeerCompileSlices(
                        fixture.projectUuid,
                    );
                    expect(snapshot).not.toBeNull();
                    const added = await projectDbtSourcesModel.createSource(
                        fixture.projectUuid,
                        {
                            name: 'up_new',
                            isPrimary: false,
                            precedence: 3,
                            dbtConnection: githubDbtConnection('org/up_new'),
                            warehouseLocation: { database: null, schema: null },
                        },
                    );
                    fixture.sourceUuids.up_new = added.projectDbtSourceUuid;
                    const before = await publicationState(fixture.projectUuid);
                    const oldBindings = await bindings(fixture.projectUuid);
                    if (mode === 'disabled before finalize')
                        mutableOptions.peerDbtSources = false;
                    if (mode === 'disabled during prepare') {
                        const prepare =
                            internals.multiConnectionCompiler.prepareSourceDeploy.bind(
                                internals.multiConnectionCompiler,
                            );
                        vi.spyOn(
                            internals.multiConnectionCompiler,
                            'prepareSourceDeploy',
                        ).mockImplementationOnce(async (...args) => {
                            const prepared = await prepare(...args);
                            mutableOptions.peerDbtSources = false;
                            return prepared;
                        });
                    }
                    const published = deploy(
                        service,
                        fixture,
                        user.userUuid,
                        'up_new',
                        'model_new',
                        snapshot,
                    );
                    if (mode === 'enabled') {
                        await expect(published).rejects.toThrow(
                            'The dbt sources changed while this compile ran, so nothing was changed. Run it again.',
                        );
                        expect(
                            await publicationState(fixture.projectUuid),
                        ).toEqual(before);
                    } else {
                        await published;
                        expect(await bindings(fixture.projectUuid)).toEqual({
                            ...oldBindings,
                            model_new: null,
                        });
                        const state = await publicationState(
                            fixture.projectUuid,
                        );
                        expect(
                            state.explores.filter(
                                ({ name }) => name !== 'model_new',
                            ),
                        ).toEqual(before.explores);
                        const incoming = await projectModel.getExploreFromCache(
                            fixture.projectUuid,
                            'model_new',
                        );
                        expect(incoming.tables?.model_new.dbtSourceUuid).toBe(
                            added.projectDbtSourceUuid,
                        );
                        expect(state.pins).toEqual([]);
                        expect(state.slices).toEqual([]);
                        expect(state.generations).toEqual([]);
                    }
                },
            );

            test('adding a peer after a full refresh snapshot rejects publication without partial changes', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const { service, internals } = compileService(
                    fixture.projectUuid,
                    options(),
                );
                const reached = deferred();
                const release = deferred();
                const save = internals.multiConnectionCompiler.save.bind(
                    internals.multiConnectionCompiler,
                );
                vi.spyOn(
                    internals.multiConnectionCompiler,
                    'save',
                ).mockImplementationOnce(async (...args) => {
                    reached.resolve();
                    await release.promise;
                    return save(...args);
                });
                const jobUuid = await createJob(
                    fixture.projectUuid,
                    user.userUuid,
                );
                const refresh = service.compileProject(
                    user,
                    fixture.projectUuid,
                    RequestMethod.WEB_APP,
                    jobUuid,
                );
                try {
                    await reached.promise;
                    await projectDbtSourcesModel.createSource(
                        fixture.projectUuid,
                        {
                            name: 'up_new',
                            isPrimary: false,
                            precedence: 3,
                            dbtConnection: githubDbtConnection('org/up_new'),
                            warehouseLocation: { database: null, schema: null },
                        },
                    );
                    const before = await publicationState(fixture.projectUuid);
                    release.resolve();
                    await refresh;
                    const job = await new JobModel({ database }).get(jobUuid);
                    expect(job.jobStatus).toBe(JobStatusType.ERROR);
                    expect(job.steps).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({
                                stepStatus: JobStepStatusType.ERROR,
                                stepError: expect.stringContaining(
                                    'The dbt sources changed while this compile ran, so nothing was changed. Run it again.',
                                ),
                            }),
                        ]),
                    );
                    expect(await publicationState(fixture.projectUuid)).toEqual(
                        before,
                    );
                } finally {
                    release.resolve();
                    await refresh.catch(() => {});
                }
            });

            test.each(['single', 'multi'] as const)(
                'a %s connection refresh records pins with cross-source refs disabled',
                async (route) => {
                    const fixture = await createProject();
                    if (route === 'single')
                        await routeSingle(fixture.projectUuid);
                    const { job } = await runCompileProject(
                        fixture.projectUuid,
                        {
                            ...options(),
                            crossSourceDbtRefs: false,
                        },
                    );
                    expect(job.jobStatus).toBe(JobStatusType.DONE);
                    const state = await publicationState(fixture.projectUuid);
                    expect(state.pins).toHaveLength(1);
                    expect(state.pins[0].pins).toHaveLength(3);
                    expect(
                        state.pins[0].pins.map(({ sourceUuid }) => sourceUuid),
                    ).toEqual(
                        expect.arrayContaining(
                            Object.values(fixture.sourceUuids),
                        ),
                    );
                    expect(state.pins[0].bindings).toEqual([]);
                },
            );

            test('a failed peer retains its last good slice and records only successful input pins', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = (await dump(fixture.projectUuid)).find(
                    ({ name }) => name === 'payments',
                );
                const { job } = await runCompileProject(fixture.projectUuid, {
                    ...options(),
                    failedSources: ['finance'],
                });
                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(
                    (await dump(fixture.projectUuid)).find(
                        ({ name }) => name === 'payments',
                    ),
                ).toEqual(before);
                const state = await publicationState(fixture.projectUuid);
                expect(state.pins).toHaveLength(1);
                expect(state.pins[0].pins).toHaveLength(2);
                expect(
                    state.pins[0].pins.map(({ sourceUuid }) => sourceUuid),
                ).not.toContain(fixture.sourceUuids.finance);
                expect(state.slices).toHaveLength(3);
                expect(
                    state.slices.every(
                        ({ generation }) => Number(generation) === 1,
                    ),
                ).toBe(true);
            });

            test('the peer flag leaves a project without extra sources unchanged', async () => {
                const fixture = await createProject(
                    postgresWarehouse(EXTRA_DB),
                    { listAllDatabases: false, additionalDatabases: [] },
                    false,
                );
                await routeSingle(fixture.projectUuid);
                await runCompileProject(fixture.projectUuid, options(false));
                const before = await publicationState(fixture.projectUuid);
                const { service } = compileService(
                    fixture.projectUuid,
                    options(),
                );
                expect(
                    await service.capturePeerCompileSlices(fixture.projectUuid),
                ).toBeNull();
                const { job } = await runCompileProject(
                    fixture.projectUuid,
                    options(),
                );
                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(await publicationState(fixture.projectUuid)).toEqual(
                    before,
                );
                expect(before.pins).toEqual([]);
                expect(before.slices).toEqual([]);
                expect(before.generations).toEqual([]);
            });

            test('a real resolver compile stores versioned and two-argument bindings with its pins', async () => {
                const fixture = await createProject();
                await routeSingle(fixture.projectUuid);
                const provider = dbtManifest('finance', [
                    {
                        name: 'payments',
                        database: ORIGINAL_DB,
                        table: 'payments',
                    },
                ]);
                const base = provider.nodes[
                    'model.finance.payments'
                ] as DbtRawModelNode & DbtManifest['nodes'][string];
                provider.nodes = Object.fromEntries(
                    [1, 2].map((version) => {
                        const node = {
                            ...base,
                            unique_id: `model.finance.payments.v${version}`,
                            version,
                            latest_version: 2,
                        };
                        return [node.unique_id, node];
                    }),
                );
                sourceManifests.finance = provider;
                const refs = [
                    { package: 'finance', name: 'payments', version: '1' },
                    { package: 'finance', name: 'payments', version: null },
                    { package: 'primary', name: 'payments', version: null },
                ];
                const primary = dbtManifest('primary', [
                    {
                        name: 'payments',
                        database: ORIGINAL_DB,
                        table: 'payments',
                    },
                ]);
                const { service } = compileService(fixture.projectUuid, {
                    ...options(),
                    primaryModels: [
                        {
                            name: 'payments',
                            database: ORIGINAL_DB,
                            table: 'payments',
                        },
                    ],
                    fetchSourceManifest: async (source, { externalNodes }) => {
                        const manifest = structuredClone(
                            sourceManifests[source],
                        );
                        if (source === 'marketing') {
                            const consumer = manifest.nodes[
                                'model.marketing.campaigns'
                            ] as DbtRawModelNode;
                            consumer.refs = refs;
                            consumer.depends_on = { nodes: [] };
                            for (const ref of refs) {
                                const node = externalNodes.find(
                                    (candidate) =>
                                        candidate.package_name ===
                                            ref.package &&
                                        candidate.name === ref.name &&
                                        (ref.version === null
                                            ? candidate.version === null ||
                                              String(candidate.version) ===
                                                  String(
                                                      candidate.latest_version,
                                                  )
                                            : String(candidate.version) ===
                                              ref.version),
                                );
                                if (!node)
                                    throw new DbtError(
                                        `Model 'model.marketing.campaigns' depends on a node named '${ref.name}'${ref.version === null ? '' : ` with version '${ref.version}'`} in package or project '${ref.package}' which was not found`,
                                    );
                                const id = `model.${node.package_name}.${node.name}${node.version === null ? '' : `.v${node.version}`}`;
                                const original = (
                                    node.package_name === 'finance'
                                        ? provider
                                        : primary
                                ).nodes[id];
                                manifest.nodes[id] = {
                                    ...original,
                                    path: '',
                                    original_file_path: '',
                                } as DbtRawModelNode &
                                    DbtManifest['nodes'][string];
                                consumer.depends_on.nodes!.push(id);
                            }
                        }
                        return {
                            manifest,
                            timings: {
                                gitRefreshMs: 0,
                                depsMs: 0,
                                manifestMs: 0,
                            },
                            commitSha: (source === 'finance'
                                ? 'a'
                                : 'b'
                            ).repeat(40),
                        };
                    },
                });
                const user = await compilingUser(fixture.projectUuid);
                const jobUuid = await createJob(
                    fixture.projectUuid,
                    user.userUuid,
                );
                await service.compileProject(
                    user,
                    fixture.projectUuid,
                    RequestMethod.WEB_APP,
                    jobUuid,
                );
                expect(
                    (await new JobModel({ database }).get(jobUuid)).jobStatus,
                ).toBe(JobStatusType.DONE);
                const persisted = await new ProjectCompileModel({
                    database,
                }).get(fixture.projectUuid, jobUuid);
                expect(persisted?.pins).toHaveLength(3);
                expect(persisted?.pins).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            sourceUuid: fixture.sourceUuids.finance,
                            commitSha: 'a'.repeat(40),
                            dbtProjectName: 'finance',
                        }),
                        expect.objectContaining({
                            sourceUuid: fixture.sourceUuids.marketing,
                            commitSha: 'b'.repeat(40),
                            dbtProjectName: 'marketing',
                        }),
                    ]),
                );
                const identity = await projectModel.getDbtSourceIdentity(
                    fixture.projectUuid,
                );
                expect(persisted?.bindings).toHaveLength(3);
                expect(persisted?.bindings).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            consumerSourceUuid: fixture.sourceUuids.marketing,
                            consumerNodeId: 'model.marketing.campaigns',
                            refPackage: 'finance',
                            refName: 'payments',
                            requestedVersion: '1',
                            providerSourceUuid: fixture.sourceUuids.finance,
                            providerPackage: 'finance',
                            providerName: 'payments',
                            resolvedVersion: '1',
                            providerCommitSha: 'a'.repeat(40),
                        }),
                        expect.objectContaining({
                            refPackage: 'finance',
                            requestedVersion: null,
                            resolvedVersion: '2',
                        }),
                        expect.objectContaining({
                            refPackage: 'primary',
                            providerSourceUuid: identity.dbtSourceUuid,
                            requestedVersion: null,
                            resolvedVersion: null,
                        }),
                    ]),
                );
                expect(persisted!.metadata_bytes).toBe(
                    Buffer.byteLength(JSON.stringify(persisted!.pins)) +
                        Buffer.byteLength(JSON.stringify(persisted!.bindings)),
                );
                expect(persisted!.metadata_bytes).toBeLessThan(10_000);
            });

            test('a full refresh started before a peer deploy cannot overwrite any slice', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const refreshing = compileService(
                    fixture.projectUuid,
                    options(),
                ).service;
                const deploying = compileService(
                    fixture.projectUuid,
                    options(),
                ).service;
                const reached = deferred();
                const release = deferred();
                const capture =
                    refreshing.capturePeerCompileSlices.bind(refreshing);
                vi.spyOn(
                    refreshing,
                    'capturePeerCompileSlices',
                ).mockImplementationOnce(async (...args) => {
                    const slices = await capture(...args);
                    reached.resolve();
                    await release.promise;
                    return slices;
                });
                const jobUuid = await createJob(
                    fixture.projectUuid,
                    user.userUuid,
                );
                const refresh = refreshing.compileProject(
                    user,
                    fixture.projectUuid,
                    RequestMethod.WEB_APP,
                    jobUuid,
                );
                try {
                    await reached.promise;
                    await deploy(
                        deploying,
                        fixture,
                        user.userUuid,
                        'finance',
                        'model_new',
                    );
                    const before = await publicationState(fixture.projectUuid);
                    release.resolve();
                    await refresh;
                    const job = await new JobModel({ database }).get(jobUuid);
                    expect(job.jobStatus).toBe(JobStatusType.ERROR);
                    expect(job.steps).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({
                                stepStatus: JobStepStatusType.ERROR,
                                stepError: expect.stringContaining(
                                    'A newer deploy or refresh of source finance was published while this one ran',
                                ),
                            }),
                        ]),
                    );
                    expect(await publicationState(fixture.projectUuid)).toEqual(
                        before,
                    );
                } finally {
                    release.resolve();
                    await refresh.catch(() => {});
                }
            });
        });

        test('saveDeployExplores with an explicit source on a multi project replaces the deployed source and keeps the other sources with their bindings', async () => {
            const fixture = await createProject();
            await compile(fixture);
            const user = await compilingUser(fixture.projectUuid);

            await compileService(
                fixture.projectUuid,
            ).service.saveDeployExplores({
                userUuid: user.userUuid,
                projectUuid: fixture.projectUuid,
                explores: [explore('orders', ['orders'])],
                compilationSource: 'cli_deploy',
                jobUuid: null,
                requestMethod: 'cli',
                complete: true,
                cliDeploy: {
                    sourceUuid: (
                        await projectModel.getDbtSourceIdentity(
                            fixture.projectUuid,
                        )
                    ).dbtSourceUuid,
                    target: null,
                },
            });

            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
        });

        test.each([
            { complete: false, dbtModelNames: ['orders'] },
            { complete: undefined, dbtModelNames: undefined },
        ])(
            'saveDeployExplores on a multi project refuses a deploy with complete $complete and saves nothing',
            async ({ complete, dbtModelNames }) => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await dump(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);

                await expect(
                    compileService(
                        fixture.projectUuid,
                    ).service.saveDeployExplores({
                        userUuid: user.userUuid,
                        projectUuid: fixture.projectUuid,
                        explores: [explore('orders', ['orders'])],
                        compilationSource: 'cli_deploy',
                        jobUuid: null,
                        requestMethod: 'cli',
                        complete,
                        dbtModelNames,
                        cliDeploy: { sourceUuid: null, target: null },
                    }),
                ).rejects.toThrow(
                    'A deploy to a project with multiple connections must send every explore of its dbt source',
                );
                expect(await dump(fixture.projectUuid)).toEqual(before);
            },
        );

        test('compileProject on a multi project with additional dbt sources off compiles the primary on the original and still compiles the extra connection', async () => {
            const fixture = await createProject();
            const { service } = compileService(fixture.projectUuid, {
                multiDbtSources: false,
                dbtProjectDir: undefined,
            });
            const user = await compilingUser(fixture.projectUuid);
            const jobUuid = await createJob(fixture.projectUuid, user.userUuid);

            await service.compileProject(
                user,
                fixture.projectUuid,
                RequestMethod.WEB_APP,
                jobUuid,
            );

            expect(await bindings(fixture.projectUuid)).toEqual({
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
            expect(fetchedWith.map(({ source }) => source)).toEqual([
                'finance',
            ]);
        });

        test('a multi compile reads the lightdash config of the primary with the analytics handle', async () => {
            const fixture = await createProject();
            const dbtProjectDir = mkdtempSync(
                path.join(tmpdir(), 'multi-compile-config-'),
            );
            writeFileSync(
                path.join(dbtProjectDir, 'lightdash.config.yml'),
                'spotlight:\n  default_visibility: show\n',
            );
            try {
                const { service, analytics } = compileService(
                    fixture.projectUuid,
                    { multiDbtSources: true, dbtProjectDir },
                );
                const user = await compilingUser(fixture.projectUuid);
                const jobUuid = await createJob(
                    fixture.projectUuid,
                    user.userUuid,
                );

                await service.compileProject(
                    user,
                    fixture.projectUuid,
                    RequestMethod.WEB_APP,
                    jobUuid,
                );

                expect(analytics.track).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'lightdashconfig.loaded',
                        userId: user.userUuid,
                    }),
                );
            } finally {
                rmSync(dbtProjectDir, { recursive: true, force: true });
            }
        });

        test.each([
            ['compileProject', runCompileProject],
            ['testAndCompileProject', runTestAndCompileProject],
        ] as const)(
            '%s tags the connection route and binding kind on Sentry',
            async (_entryPoint, run) => {
                const multi = await createProject();
                const single = await createProject();
                await routeSingle(single.projectUuid);
                const setTag = vi.mocked(Sentry.setTag);
                setTag.mockClear();

                await run(multi.projectUuid);
                const multiTags = setTag.mock.calls.filter(
                    ([key]) =>
                        key === 'warehouse.route' ||
                        key === 'warehouse.binding_kind',
                );
                setTag.mockClear();
                await run(single.projectUuid);
                const singleTags = setTag.mock.calls.filter(
                    ([key]) =>
                        key === 'warehouse.route' ||
                        key === 'warehouse.binding_kind',
                );

                expect(multiTags).toEqual([
                    ['warehouse.route', 'multi'],
                    ['warehouse.binding_kind', 'original'],
                ]);
                expect(singleTags).toEqual([
                    ['warehouse.route', 'single'],
                    ['warehouse.binding_kind', 'original'],
                ]);
            },
        );

        describe('CLI deploy through the entry points', () => {
            const NO_SOURCE = { sourceUuid: null, target: null };
            const sourceExplore = (
                name: string,
                packageName: string,
            ): Explore => {
                const result = explore(name, [name]);
                result.tables[name].dbtPackageName = packageName;
                return result;
            };

            const deployService = (projectUuid: string) =>
                new DeployService({
                    deploySessionModel: new DeploySessionModel(database),
                    projectModel,
                    projectService: compileService(projectUuid).service,
                    schedulerClient: {
                        generateValidation: async () => {},
                    } as never,
                });

            const withClientBinding = (
                deployed: Explore,
                warehouseConnectionUuid: string,
            ): Explore =>
                ({
                    ...deployed,
                    connectionUuid: warehouseConnectionUuid,
                    warehouseConnectionUuid,
                    tables: Object.fromEntries(
                        Object.entries(deployed.tables).map(([name, table]) => [
                            name,
                            {
                                ...table,
                                connectionUuid: warehouseConnectionUuid,
                                warehouseConnectionUuid,
                            },
                        ]),
                    ),
                }) as Explore;

            test('setExplores on a multi project deploys a named source to its connection and keeps the other sources', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);

                await compileService(fixture.projectUuid).service.setExplores(
                    user,
                    fixture.projectUuid,
                    [sourceExplore('refunds', 'finance')],
                    'cli-1',
                    true,
                    undefined,
                    {
                        sourceUuid: fixture.sourceUuids.finance,
                        target: { database: EXTRA_DB },
                    },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    customers: null,
                    orders: null,
                    refunds: fixture.extraConnectionUuid,
                });
            });

            test('setExplores infers the primary source from its package and checks its target', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);

                await compileService(fixture.projectUuid).service.setExplores(
                    user,
                    fixture.projectUuid,
                    [explore('orders', ['orders'])],
                    'cli-1',
                    true,
                    undefined,
                    { sourceUuid: null, target: { database: ORIGINAL_DB } },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
            });

            test('a deploy with no source whose target database differs from the original is refused and saves nothing (D3)', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await dump(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);

                await expect(
                    compileService(fixture.projectUuid).service.setExplores(
                        user,
                        fixture.projectUuid,
                        [explore('orders', ['orders'])],
                        'cli-1',
                        true,
                        undefined,
                        { sourceUuid: null, target: { database: EXTRA_DB } },
                    ),
                ).rejects.toThrow(
                    `The dbt target compiles against database ${EXTRA_DB}, but the deploy goes to the connection "Original", which points at ${ORIGINAL_DB}. Check the dbt target and the source's warehouse connection in project settings.`,
                );
                expect(await dump(fixture.projectUuid)).toEqual(before);
            });

            test('a source deploy checks the target against the source connection and saves nothing on a mismatch', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await dump(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);

                await expect(
                    compileService(fixture.projectUuid).service.setExplores(
                        user,
                        fixture.projectUuid,
                        [sourceExplore('refunds', 'finance')],
                        'cli-1',
                        true,
                        undefined,
                        {
                            sourceUuid: fixture.sourceUuids.finance,
                            target: { database: ORIGINAL_DB },
                        },
                    ),
                ).rejects.toThrow(
                    `The dbt target compiles against database ${ORIGINAL_DB}, but the deploy goes to the connection "Finance warehouse", which points at ${EXTRA_DB}.`,
                );
                expect(await dump(fixture.projectUuid)).toEqual(before);
            });

            test('a deploy that names a dbt source of another project is refused and saves nothing', async () => {
                const fixture = await createProject();
                const other = await createProject();
                await compile(fixture);
                const before = await dump(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);

                await expect(
                    compileService(fixture.projectUuid).service.setExplores(
                        user,
                        fixture.projectUuid,
                        [sourceExplore('refunds', 'finance')],
                        'cli-1',
                        true,
                        undefined,
                        {
                            sourceUuid: other.sourceUuids.finance,
                            target: null,
                        },
                    ),
                ).rejects.toThrow(
                    'The selected dbt source does not belong to this project',
                );
                expect(await dump(fixture.projectUuid)).toEqual(before);
            });

            test('a deploy body that carries another project connection uuid is stored with the server binding', async () => {
                const fixture = await createProject();
                const other = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const { service } = compileService(fixture.projectUuid);

                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [
                        withClientBinding(
                            explore('orders', ['orders']),
                            other.extraConnectionUuid,
                        ),
                    ],
                    'cli-1',
                    true,
                    undefined,
                    NO_SOURCE,
                );
                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [
                        withClientBinding(
                            sourceExplore('refunds', 'finance'),
                            other.extraConnectionUuid,
                        ),
                    ],
                    'cli-1',
                    true,
                    undefined,
                    { sourceUuid: fixture.sourceUuids.finance, target: null },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    orders: null,
                    refunds: fixture.extraConnectionUuid,
                });
                expect(
                    JSON.stringify(
                        (await cachedExplores(fixture.projectUuid)).map(
                            (row) => row.explore,
                        ),
                    ),
                ).not.toContain(other.extraConnectionUuid);
            });

            test.each(['direct', 'session'] as const)(
                '%s deploy returns server name warnings and uses the configured source namespace',
                async (kind) => {
                    const fixture = await createProject();
                    await compile(fixture);
                    await projectDbtSourcesModel.updateSource(
                        fixture.sourceUuids.finance,
                        { name: 'billing' },
                    );
                    const user = await compilingUser(fixture.projectUuid);
                    const payload = explore('orders', ['orders']);
                    payload.dbtModelIdentity = {
                        sourceUuid: null,
                        sourceName: null,
                        packageName: 'finance',
                        uniqueId: 'model.finance.orders',
                        modelName: 'orders',
                    };
                    payload.tables.orders.dbtPackageName = 'finance';
                    payload.tables.orders.dbtModelUniqueId =
                        'model.finance.orders';
                    const selection = {
                        sourceUuid: fixture.sourceUuids.finance,
                        target: null,
                    };
                    let result;
                    if (kind === 'direct')
                        result = await compileService(
                            fixture.projectUuid,
                        ).service.setExplores(
                            user,
                            fixture.projectUuid,
                            [payload],
                            'cli-test',
                            true,
                            undefined,
                            selection,
                        );
                    else {
                        const service = deployService(fixture.projectUuid);
                        const { deploySessionUuid } =
                            await service.startDeploySession(
                                fromSession(user, 'session-cookie'),
                                fixture.projectUuid,
                            );
                        await service.addDeployBatch(
                            user,
                            fixture.projectUuid,
                            deploySessionUuid,
                            [payload],
                            0,
                            true,
                        );
                        result = await service.finalizeDeploy(
                            user,
                            fixture.projectUuid,
                            deploySessionUuid,
                            'cli-test',
                            undefined,
                            selection,
                        );
                    }
                    expect(result.warnings).toMatchObject({
                        warningCount: 1,
                        exploresWithWarnings: [
                            {
                                name: 'billing__orders',
                                warnings: [
                                    {
                                        type: 'EXPLORE_NAME_COLLISION',
                                        message: expect.stringContaining(
                                            'model.primary.orders',
                                        ),
                                    },
                                ],
                            },
                        ],
                    });
                    expect(await bindings(fixture.projectUuid)).toMatchObject({
                        orders: null,
                        billing__orders: fixture.extraConnectionUuid,
                    });
                },
            );

            test('a batched CLI deploy to a multi project starts, uploads and finalizes with the named source', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const service = deployService(fixture.projectUuid);

                const { deploySessionUuid } = await service.startDeploySession(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                );
                await service.addDeployBatch(
                    user,
                    fixture.projectUuid,
                    deploySessionUuid,
                    [sourceExplore('refunds', 'finance')],
                    0,
                    true,
                );
                await service.finalizeDeploy(
                    user,
                    fixture.projectUuid,
                    deploySessionUuid,
                    'cli-1',
                    undefined,
                    {
                        sourceUuid: fixture.sourceUuids.finance,
                        target: { database: EXTRA_DB },
                    },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    customers: null,
                    orders: null,
                    refunds: fixture.extraConnectionUuid,
                });
            });

            test.each(['missing', 'foreign', 'persisted'] as const)(
                'a batched single-connection deploy with %s ownership survives a source clone failure',
                async (ownership) => {
                    const fixture = await createProject();
                    await bind(fixture, 'finance', null);
                    await routeSingle(fixture.projectUuid);
                    await database('warehouse_connections')
                        .where(
                            'warehouse_connection_uuid',
                            fixture.extraConnectionUuid,
                        )
                        .delete();
                    await compile(
                        fixture,
                        primaryModels,
                        postgresWarehouse(ORIGINAL_DB),
                        true,
                        {
                            sources: [],
                            phase: 'prepare',
                            crossSourceRefs: true,
                        },
                    );
                    const deployed = (
                        await cachedExplores(fixture.projectUuid)
                    ).find((row) => row.name === 'campaigns')!
                        .explore as Explore;
                    for (const table of Object.values(deployed.tables)) {
                        if (ownership === 'missing') delete table.dbtSourceUuid;
                        if (ownership === 'foreign')
                            table.dbtSourceUuid = randomUUID();
                    }
                    const user = await compilingUser(fixture.projectUuid);
                    const service = deployService(fixture.projectUuid);
                    const { deploySessionUuid } =
                        await service.startDeploySession(
                            fromSession(user, 'session-cookie'),
                            fixture.projectUuid,
                        );
                    await service.addDeployBatch(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        [deployed],
                        0,
                        true,
                    );
                    await service.finalizeDeploy(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        'cli-1',
                        undefined,
                        {
                            sourceUuid: fixture.sourceUuids.marketing,
                            target: { database: ORIGINAL_DB },
                        },
                    );
                    const before = await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .first();
                    expect(before).toBeDefined();
                    const result = await compile(
                        fixture,
                        primaryModels.map((model) => ({
                            ...model,
                            label: 'Refreshed',
                        })),
                        postgresWarehouse(ORIGINAL_DB),
                        true,
                        {
                            sources: ['marketing'],
                            phase: 'prepare',
                            crossSourceRefs: true,
                        },
                    );
                    expect(
                        await database('cached_explore')
                            .where({
                                project_uuid: fixture.projectUuid,
                                name: 'campaigns',
                            })
                            .first(),
                    ).toEqual(before);
                    expect(result.warnings).toContainEqual(
                        expect.stringContaining('kept its 1 explores'),
                    );
                    expect(
                        (await cachedExplores(fixture.projectUuid)).map(
                            (row) => row.name,
                        ),
                    ).toEqual(['campaigns', 'customers', 'orders', 'payments']);
                    expect(
                        (await cachedExplores(fixture.projectUuid)).find(
                            (row) => row.name === 'orders',
                        )?.explore.label,
                    ).toBe('Refreshed');
                },
            );

            const assertInstalledPackageCarry = async ({
                sourceSelection,
                route,
                collision = false,
            }: {
                sourceSelection:
                    | 'default'
                    | 'explicit'
                    | 'legacy without stamps'
                    | 'legacy with foreign stamps'
                    | 'legacy before allocations';
                route: 'single' | 'multi';
                collision?: boolean;
            }) => {
                const fixture = await createProject();
                await bind(fixture, 'finance', null);
                if (route === 'single') await routeSingle(fixture.projectUuid);
                if (route === 'single')
                    await database('warehouse_connections')
                        .where(
                            'warehouse_connection_uuid',
                            fixture.extraConnectionUuid,
                        )
                        .delete();
                expect(
                    await projectModel.getConnectionRoute(fixture.projectUuid, {
                        kind: 'original',
                    }),
                ).toBe(route);
                sourceManifests.marketing = dbtManifest('marketing', [
                    {
                        name: 'campaigns',
                        database: ORIGINAL_DB,
                        table: 'campaigns',
                    },
                    {
                        name: 'settlements',
                        database: ORIGINAL_DB,
                        table: 'campaigns',
                    },
                ]);
                Object.assign(
                    sourceManifests.marketing.nodes,
                    dbtManifest('synthetic_vendor', [
                        {
                            name: 'vendor_receipt',
                            database: ORIGINAL_DB,
                            table: 'campaigns',
                        },
                    ]).nodes,
                );
                const external = dbtManifest('reference_only', [
                    {
                        name: 'external_stub',
                        database: ORIGINAL_DB,
                        table: 'campaigns',
                    },
                ]);
                Object.assign(
                    sourceManifests.marketing.nodes,
                    Object.fromEntries(
                        Object.entries(external.nodes).map(([id, node]) => [
                            id,
                            { ...node, path: '', original_file_path: '' },
                        ]),
                    ),
                );
                await compile(
                    fixture,
                    primaryModels,
                    postgresWarehouse(ORIGINAL_DB),
                    true,
                    { sources: [], phase: 'prepare', crossSourceRefs: true },
                );
                const sourceCatalog = await database('dbt_source_ref_catalogs')
                    .where({
                        project_uuid: fixture.projectUuid,
                        dbt_source_uuid: fixture.sourceUuids.marketing,
                    })
                    .first();
                expect(sourceCatalog?.project_name).toBe('marketing');
                expect(
                    sourceCatalog?.nodes.map((node) => node.package_name),
                ).toEqual(
                    expect.arrayContaining(['marketing', 'synthetic_vendor']),
                );
                expect(
                    sourceCatalog?.nodes.map((node) => node.package_name),
                ).not.toContain('reference_only');
                const names = ['campaigns', 'settlements', 'vendor_receipt'];
                const deployed = (await cachedExplores(fixture.projectUuid))
                    .filter((row) => names.includes(row.name))
                    .map((row) => row.explore as Explore);
                const foreignSourceUuid = randomUUID();
                for (const legacy of deployed) {
                    if (sourceSelection.startsWith('legacy'))
                        delete legacy.dbtModelIdentity;
                    for (const table of Object.values(legacy.tables)) {
                        if (sourceSelection.startsWith('legacy')) {
                            delete table.dbtSourceName;
                            delete table.dbtModelUniqueId;
                        }
                        if (sourceSelection === 'legacy with foreign stamps')
                            table.dbtSourceUuid = foreignSourceUuid;
                        else delete table.dbtSourceUuid;
                    }
                }
                if (sourceSelection.startsWith('legacy')) {
                    await projectModel.saveExploresToCache(
                        fixture.projectUuid,
                        deployed,
                        true,
                    );
                } else {
                    const user = await compilingUser(fixture.projectUuid);
                    const service = deployService(fixture.projectUuid);
                    const { deploySessionUuid } =
                        await service.startDeploySession(
                            fromSession(user, 'session-cookie'),
                            fixture.projectUuid,
                        );
                    await service.addDeployBatch(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        deployed,
                        0,
                        true,
                    );
                    await service.finalizeDeploy(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        'cli-1',
                        undefined,
                        sourceSelection === 'explicit'
                            ? {
                                  sourceUuid: fixture.sourceUuids.marketing,
                                  target: { database: ORIGINAL_DB },
                              }
                            : NO_SOURCE,
                    );
                }
                if (sourceSelection === 'legacy before allocations')
                    await database('explore_name_allocations')
                        .where('project_uuid', fixture.projectUuid)
                        .delete();
                const before = await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .whereIn('name', names)
                    .orderBy('name');
                expect(before).toHaveLength(3);
                const carriedAllocations = () =>
                    database('explore_name_allocations')
                        .where('project_uuid', fixture.projectUuid)
                        .whereIn('name', names)
                        .orderBy('name');
                const reservations = () =>
                    database('explore_name_allocations')
                        .where({
                            project_uuid: fixture.projectUuid,
                            is_reserved: true,
                        })
                        .orderBy('name');
                const allocationsBefore = await carriedAllocations();
                const reservationsBefore = await reservations();
                const refreshedModels = (label: string) => [
                    ...primaryModels.map((model) => ({ ...model, label })),
                    ...(collision
                        ? [
                              {
                                  name: 'vendor_receipt',
                                  database: ORIGINAL_DB,
                                  table: 'orders',
                                  label,
                              },
                          ]
                        : []),
                ];
                const primaryIdentity = await projectModel.getDbtSourceIdentity(
                    fixture.projectUuid,
                );
                const qualifiedName = `${primaryIdentity.dbtSourceName}__vendor_receipt`;
                const refresh = async (label: string) => {
                    const { job } = await runCompileProject(
                        fixture.projectUuid,
                        {
                            ...defaultCompileServiceOptions,
                            primaryModels: refreshedModels(label),
                            failedSources: ['marketing'],
                        },
                    );
                    expect(job.jobStatus).toBe(JobStatusType.DONE);
                    expect(
                        await database('cached_explore')
                            .where('project_uuid', fixture.projectUuid)
                            .whereIn('name', names)
                            .orderBy('name'),
                    ).toEqual(before);
                    expect(
                        (await latestReport(fixture.projectUuid))
                            .connectionWarnings,
                    ).toContainEqual(
                        expect.stringContaining('kept its 3 explores'),
                    );
                    expect(
                        (await cachedExplores(fixture.projectUuid)).find(
                            (row) => row.name === 'orders',
                        )?.explore.label,
                    ).toBe(label);
                    if (collision)
                        expect(
                            (await cachedExplores(fixture.projectUuid)).find(
                                (row) => row.name === qualifiedName,
                            )?.explore.label,
                        ).toBe(label);
                };
                await refresh('First refresh');
                const allocationsAfterFirst = await carriedAllocations();
                expect(allocationsAfterFirst).toHaveLength(3);
                if (sourceSelection !== 'legacy before allocations')
                    expect(allocationsAfterFirst).toEqual(allocationsBefore);
                expect(await reservations()).toEqual(reservationsBefore);
                await refresh('Second refresh');
                expect(await carriedAllocations()).toEqual(
                    allocationsAfterFirst,
                );
                expect(await reservations()).toEqual(reservationsBefore);
                expect(
                    await database('explore_name_allocations')
                        .where('project_uuid', fixture.projectUuid)
                        .whereIn('name', names)
                        .pluck('source_key'),
                ).toEqual(names.map(() => fixture.sourceUuids.marketing));
                const { job } = await runCompileProject(fixture.projectUuid, {
                    ...defaultCompileServiceOptions,
                    primaryModels: refreshedModels('Recovered'),
                });
                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(
                    (await carriedAllocations()).map((row) => [
                        row.name,
                        row.explore_name_allocation_uuid,
                    ]),
                ).toEqual(
                    allocationsAfterFirst.map((row) => [
                        row.name,
                        row.explore_name_allocation_uuid,
                    ]),
                );
                expect(await reservations()).toEqual(reservationsBefore);
                expect(
                    (
                        await database('cached_explore')
                            .where('project_uuid', fixture.projectUuid)
                            .whereIn('name', names)
                            .orderBy('name')
                    ).map((row) => [row.name, row.cached_explore_uuid]),
                ).toEqual(
                    before.map((row) => [row.name, row.cached_explore_uuid]),
                );
                expect(
                    (await latestReport(fixture.projectUuid))
                        .connectionWarnings ?? [],
                ).not.toContainEqual(expect.stringContaining(' failed: '));
            };

            test.each([
                ...(['single', 'multi'] as const).flatMap((route) =>
                    (
                        [
                            'default',
                            'explicit',
                            'legacy without stamps',
                            'legacy with foreign stamps',
                            'legacy before allocations',
                        ] as const
                    ).map((sourceSelection) => ({
                        route,
                        sourceSelection,
                        collision: false,
                    })),
                ),
                ...(['single', 'multi'] as const).map((route) => ({
                    route,
                    sourceSelection: 'legacy before allocations' as const,
                    collision: true,
                })),
            ])(
                'a $route connection refresh keeps installed-package explores from a $sourceSelection deploy across repeated failures (collision $collision)',
                assertInstalledPackageCarry,
            );

            test.each(['single', 'multi'] as const)(
                'a sourceless batched deploy preserves other sources on a %s connection project',
                async (route) => {
                    const fixture = await createProject();
                    if (route === 'single')
                        await bind(fixture, 'finance', null);
                    await compile(fixture);
                    if (route === 'single')
                        await routeSingle(fixture.projectUuid);
                    const user = await compilingUser(fixture.projectUuid);
                    const service = deployService(fixture.projectUuid);
                    const { deploySessionUuid } =
                        await service.startDeploySession(
                            fromSession(user, 'session-cookie'),
                            fixture.projectUuid,
                        );
                    await service.addDeployBatch(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        [explore('orders', ['orders'])],
                        0,
                        true,
                    );
                    await service.finalizeDeploy(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        'cli-1',
                        ['orders', 'primary__orders'],
                    );
                    expect(await bindings(fixture.projectUuid)).toEqual({
                        campaigns: null,
                        orders: null,
                        payments:
                            route === 'multi'
                                ? fixture.extraConnectionUuid
                                : null,
                    });
                },
            );

            test.each([false, true])(
                'a fresh preview publishes each source in a mixed batched upload (explicit %s)',
                async (explicit) => {
                    const fixture = await createProject(
                        undefined,
                        undefined,
                        true,
                        ProjectType.PREVIEW,
                    );
                    await bind(fixture, 'finance', null);
                    await routeSingle(fixture.projectUuid);
                    const identity = await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                    await Promise.all(
                        [
                            ['primary', identity.dbtSourceUuid],
                            ['finance', fixture.sourceUuids.finance],
                        ].map(async ([projectName, dbtSourceUuid]) => {
                            await new DbtSourceRefCatalogModel({
                                database,
                            }).upsertProvisional({
                                projectUuid: fixture.projectUuid,
                                dbtSourceUuid,
                                connectionGroup: 'original',
                                projectName,
                                dbtVersion: '1.7.0',
                                nodes: [],
                                referencedProjects: [],
                                compileJobUuid: null,
                            });
                        }),
                    );
                    const user = await compilingUser(fixture.projectUuid);
                    const service = deployService(fixture.projectUuid);
                    const { deploySessionUuid } =
                        await service.startDeploySession(
                            fromSession(user, 'session-cookie'),
                            fixture.projectUuid,
                        );
                    await service.addDeployBatch(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        [
                            sourceExplore('orders', 'primary'),
                            sourceExplore('refunds', 'finance'),
                        ],
                        0,
                        true,
                    );
                    const finalized = await service.finalizeDeploy(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        'cli-1',
                        undefined,
                        {
                            sourceUuid: explicit
                                ? fixture.sourceUuids.finance
                                : null,
                            target: null,
                        },
                    );
                    const rows = await cachedExplores(fixture.projectUuid);
                    expect(rows.map((row) => row.name)).toEqual([
                        'orders',
                        'refunds',
                    ]);
                    expect(rows[0].explore.tables?.orders.dbtSourceUuid).toBe(
                        identity.dbtSourceUuid,
                    );
                    expect(rows[1].explore.tables?.refunds.dbtSourceUuid).toBe(
                        fixture.sourceUuids.finance,
                    );
                    expect(finalized.status).toBe(
                        DeploySessionStatus.COMPLETED,
                    );
                    await expect(
                        new DeploySessionModel(database).getSession(
                            deploySessionUuid,
                        ),
                    ).rejects.toMatchObject({ statusCode: 404 });
                },
            );

            test('a batched CLI deploy with a mismatched target fails the session and saves nothing (D3)', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await dump(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);
                const service = deployService(fixture.projectUuid);
                const { deploySessionUuid } = await service.startDeploySession(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                );
                await service.addDeployBatch(
                    user,
                    fixture.projectUuid,
                    deploySessionUuid,
                    [explore('orders', ['orders'])],
                    0,
                    true,
                );

                await expect(
                    service.finalizeDeploy(
                        user,
                        fixture.projectUuid,
                        deploySessionUuid,
                        'cli-1',
                        undefined,
                        { sourceUuid: null, target: { database: EXTRA_DB } },
                    ),
                ).rejects.toThrow(`which points at ${ORIGINAL_DB}`);
                expect(await dump(fixture.projectUuid)).toEqual(before);
            });

            const brokenExplore = (name: string): ExploreError => ({
                name,
                label: name,
                errors: [
                    { type: 'NO_DIMENSIONS_FOUND', message: name } as never,
                ],
            });

            test('a deploy of the primary keeps the error explores that another source deployed', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const { service } = compileService(fixture.projectUuid);
                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [
                        sourceExplore('refunds', 'finance'),
                        brokenExplore('broken_finance'),
                    ],
                    'cli-1',
                    true,
                    undefined,
                    { sourceUuid: fixture.sourceUuids.finance, target: null },
                );

                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [explore('orders', ['orders'])],
                    'cli-1',
                    true,
                    undefined,
                    NO_SOURCE,
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    broken_finance: fixture.extraConnectionUuid,
                    campaigns: null,
                    orders: null,
                    refunds: fixture.extraConnectionUuid,
                });
            });

            test('an explicit deploy of the primary keeps an extra connection error explore that has no source stamp', async () => {
                const fixture = await createProject();
                await compile(fixture);
                await database('cached_explore').insert({
                    project_uuid: fixture.projectUuid,
                    name: 'broken_payments',
                    table_names: [],
                    explore: JSON.stringify(brokenExplore('broken_payments')),
                    warehouse_connection_uuid: fixture.extraConnectionUuid,
                } as never);
                const user = await compilingUser(fixture.projectUuid);

                await compileService(fixture.projectUuid).service.setExplores(
                    user,
                    fixture.projectUuid,
                    [explore('orders', ['orders'])],
                    'cli-1',
                    true,
                    undefined,
                    {
                        sourceUuid: (
                            await projectModel.getDbtSourceIdentity(
                                fixture.projectUuid,
                            )
                        ).dbtSourceUuid,
                        target: null,
                    },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    broken_payments: fixture.extraConnectionUuid,
                    campaigns: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
            });

            test('a deploy of the primary replaces the error explores that the primary deployed before', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const { service } = compileService(fixture.projectUuid);
                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [
                        explore('orders', ['orders']),
                        brokenExplore('broken_orders'),
                    ],
                    'cli-1',
                    true,
                    undefined,
                    NO_SOURCE,
                );

                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [explore('orders', ['orders'])],
                    'cli-1',
                    true,
                    undefined,
                    NO_SOURCE,
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
            });

            const setOriginalCredentials = async (
                projectUuid: string,
                credentials: Record<string, unknown>,
            ) => {
                const [{ project_id: projectId }] = await database('projects')
                    .select('project_id')
                    .where('project_uuid', projectUuid);
                await database('warehouse_credentials')
                    .where('project_id', projectId)
                    .update({
                        warehouse_type: credentials.type,
                        encrypted_credentials: encryptionUtil.encrypt(
                            JSON.stringify(credentials),
                        ),
                    } as never);
            };

            test.each([
                { region: 'eu-west-1', refused: false },
                { region: 'us-east-1', refused: true },
            ])(
                'a deploy to an Athena original checks the region of the dbt target (region $region)',
                async ({ region, refused }) => {
                    const fixture = await createProject();
                    await setOriginalCredentials(fixture.projectUuid, {
                        type: 'athena',
                        region: 'eu-west-1',
                        database: 'AwsDataCatalog',
                        schema: 'analytics',
                        s3StagingDir: 's3://staging',
                        authenticationType: 'access_key',
                        accessKeyId: 'access-key',
                        secretAccessKey: 'secret-key',
                    });
                    const user = await compilingUser(fixture.projectUuid);
                    const deploy = compileService(
                        fixture.projectUuid,
                    ).service.setExplores(
                        user,
                        fixture.projectUuid,
                        [explore('orders', ['orders'])],
                        'cli-1',
                        true,
                        undefined,
                        {
                            sourceUuid: (
                                await projectModel.getDbtSourceIdentity(
                                    fixture.projectUuid,
                                )
                            ).dbtSourceUuid,
                            target: { database: 'AwsDataCatalog', region },
                        },
                    );

                    if (refused) {
                        await expect(deploy).rejects.toThrow(
                            'The dbt target compiles against region us-east-1, but the deploy goes to the connection "Original", which points at eu-west-1.',
                        );
                    } else {
                        await expect(deploy).resolves.toMatchObject({
                            exploreCount: 1,
                        });
                    }
                },
            );

            test('a server compile stamps the source on error explores, and a deploy of the primary keeps the error explore of another source on the original', async () => {
                const fixture = await createProject();
                sourceManifests.marketing = dbtManifest('marketing', [
                    {
                        name: 'campaigns',
                        database: ORIGINAL_DB,
                        table: 'campaigns',
                    },
                    {
                        name: 'broken_campaigns',
                        database: ORIGINAL_DB,
                        table: 'campaigns',
                    },
                ]);
                (
                    sourceManifests.marketing.nodes[
                        'model.marketing.broken_campaigns'
                    ] as unknown as { columns: unknown }
                ).columns = {};
                await compile(fixture);

                const broken = (await cachedExplores(fixture.projectUuid)).find(
                    (row) => row.name === 'broken_campaigns',
                );
                expect(broken?.explore).toMatchObject({
                    errors: expect.any(Array),
                    dbtSourceUuid: fixture.sourceUuids.marketing,
                });

                const user = await compilingUser(fixture.projectUuid);
                await compileService(fixture.projectUuid).service.setExplores(
                    user,
                    fixture.projectUuid,
                    [explore('orders', ['orders'])],
                    'cli-1',
                    true,
                    undefined,
                    NO_SOURCE,
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    broken_campaigns: null,
                    campaigns: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
            });

            test('with two sources on one extra connection, a deploy of one keeps the error explores that the other deployed', async () => {
                const fixture = await createProject();
                await bind(fixture, 'marketing', fixture.extraConnectionUuid);
                await compile(fixture);
                const user = await compilingUser(fixture.projectUuid);
                const { service } = compileService(fixture.projectUuid);
                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [
                        sourceExplore('refunds', 'finance'),
                        brokenExplore('broken_finance'),
                    ],
                    'cli-1',
                    true,
                    undefined,
                    { sourceUuid: fixture.sourceUuids.finance, target: null },
                );

                await service.setExplores(
                    user,
                    fixture.projectUuid,
                    [sourceExplore('campaigns', 'marketing')],
                    'cli-1',
                    true,
                    undefined,
                    {
                        sourceUuid: fixture.sourceUuids.marketing,
                        target: null,
                    },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    broken_finance: fixture.extraConnectionUuid,
                    campaigns: fixture.extraConnectionUuid,
                    customers: null,
                    orders: null,
                    refunds: fixture.extraConnectionUuid,
                });
            });

            test('an explicit deploy replaces an error explore with no source stamp on its own connection', async () => {
                const fixture = await createProject();
                await compile(fixture);
                await database('cached_explore').insert({
                    project_uuid: fixture.projectUuid,
                    name: 'broken_orders',
                    table_names: [],
                    explore: JSON.stringify(brokenExplore('broken_orders')),
                    warehouse_connection_uuid: null,
                } as never);
                const user = await compilingUser(fixture.projectUuid);

                await compileService(fixture.projectUuid).service.setExplores(
                    user,
                    fixture.projectUuid,
                    [explore('orders', ['orders'])],
                    'cli-1',
                    true,
                    undefined,
                    {
                        sourceUuid: (
                            await projectModel.getDbtSourceIdentity(
                                fixture.projectUuid,
                            )
                        ).dbtSourceUuid,
                        target: null,
                    },
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
            });

            test('a project without extra sources ignores the source and the target and writes the rows of the main deploy save', async () => {
                const deployed = await createProject(
                    postgresWarehouse(EXTRA_DB),
                    { listAllDatabases: false, additionalDatabases: [] },
                    false,
                );
                const baseline = await createProject(
                    postgresWarehouse(EXTRA_DB),
                    { listAllDatabases: false, additionalDatabases: [] },
                    false,
                );
                await Promise.all(
                    [deployed, baseline].map(async ({ projectUuid }) => {
                        await routeSingle(projectUuid);
                        await seedCachedExplores(projectUuid);
                    }),
                );
                const user = await compilingUser(deployed.projectUuid);

                await compileService(deployed.projectUuid).service.setExplores(
                    user,
                    deployed.projectUuid,
                    deployInputs(),
                    'cli-1',
                    true,
                    undefined,
                    {
                        sourceUuid: randomUUID(),
                        target: { database: 'another_database' },
                    },
                );
                await compileService(
                    baseline.projectUuid,
                ).service.saveExploresToCacheAndIndexCatalog({
                    userUuid: user.userUuid,
                    projectUuid: baseline.projectUuid,
                    explores: deployInputs(),
                    compilationSource: 'cli_deploy',
                    jobUuid: null,
                    requestMethod: 'cli',
                    cliVersion: 'cli-1',
                    complete: true,
                    dbtModelNames: undefined,
                });

                expect(await dump(deployed.projectUuid)).toEqual(
                    await dump(baseline.projectUuid),
                );
            });
        });

        describe('virtual views on an extra connection', () => {
            const databricks = (serverHostName: string) => ({
                type: 'databricks',
                serverHostName,
                httpPath: '/sql/1.0/warehouses/abc',
                personalAccessToken: 'project-token',
                catalog: 'main',
                database: 'public',
                requireUserCredentials: true,
            });

            const viewPayload = {
                sql: 'SELECT 1 AS amount',
                columns: [{ reference: 'amount', type: DimensionType.NUMBER }],
            };

            const viewService = (projectUuid: string) => {
                const { service } = compileService(projectUuid);
                Object.assign(service, {
                    userAttributesModel: {
                        getAttributeValuesForOrgMember: async () => ({}),
                    },
                    emailModel: {
                        getPrimaryEmailStatus: async () => ({
                            isVerified: false,
                        }),
                    },
                    analytics: { track: vi.fn(), trackAccount: vi.fn() },
                });
                return service;
            };

            const viewBinding = async (projectUuid: string, name: string) =>
                (
                    await database('cached_explore')
                        .select('warehouse_connection_uuid')
                        .where('project_uuid', projectUuid)
                        .where('name', name)
                        .first()
                )?.warehouse_connection_uuid;

            test('the SQL runner creates a view on the connection it names, and the view runs there', async () => {
                const fixture = await createProject();
                const user = await compilingUser(fixture.projectUuid);

                await viewService(fixture.projectUuid).createVirtualView(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                    {
                        ...viewPayload,
                        name: 'finance_view',
                        warehouseConnectionUuid: fixture.extraConnectionUuid,
                    },
                    false,
                );
                await viewService(fixture.projectUuid).createVirtualView(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                    {
                        ...viewPayload,
                        name: 'original_view',
                        warehouseConnectionUuid: fixture.originalConnectionUuid,
                    },
                    false,
                );

                expect(
                    await viewBinding(fixture.projectUuid, 'finance_view'),
                ).toBe(fixture.extraConnectionUuid);
                expect(
                    await viewBinding(fixture.projectUuid, 'original_view'),
                ).toBeNull();
                await expect(
                    projectModel.resolveWarehouseCredentialRead(
                        fixture.projectUuid,
                        { kind: 'explore', exploreName: 'finance_view' },
                    ),
                ).resolves.toEqual({
                    kind: 'extra',
                    warehouseConnectionUuid: fixture.extraConnectionUuid,
                });
            });

            test.each([
                ['a connection of another project', 'other'],
                ['an unknown connection', 'unknown'],
            ] as const)(
                'the SQL runner refuses to create a view on %s and writes nothing',
                async (_name, planted) => {
                    const fixture = await createProject();
                    const other = await createProject();
                    const user = await compilingUser(fixture.projectUuid);

                    await expect(
                        viewService(fixture.projectUuid).createVirtualView(
                            fromSession(user, 'session-cookie'),
                            fixture.projectUuid,
                            {
                                ...viewPayload,
                                name: 'planted_view',
                                warehouseConnectionUuid:
                                    planted === 'other'
                                        ? other.extraConnectionUuid
                                        : randomUUID(),
                            },
                            false,
                        ),
                    ).rejects.toThrow(
                        new NotFoundError('Connection not found'),
                    );
                    expect(
                        await viewBinding(fixture.projectUuid, 'planted_view'),
                    ).toBeUndefined();
                },
            );

            test('a single project refuses a connection and writes nothing', async () => {
                const fixture = await createProject();
                await routeSingle(fixture.projectUuid);
                const user = await compilingUser(fixture.projectUuid);

                await expect(
                    viewService(fixture.projectUuid).createVirtualView(
                        fromSession(user, 'session-cookie'),
                        fixture.projectUuid,
                        {
                            ...viewPayload,
                            name: 'single_view',
                            warehouseConnectionUuid:
                                fixture.extraConnectionUuid,
                        },
                        false,
                    ),
                ).rejects.toThrow(
                    new ParameterError(
                        'A virtual view can name a connection only in a project with multiple connections',
                    ),
                );
                expect(
                    await viewBinding(fixture.projectUuid, 'single_view'),
                ).toBeUndefined();
            });

            test.each([null, undefined])(
                'a single project creates the view on the original when the connection is %s',
                async (warehouseConnectionUuid) => {
                    const fixture = await createProject();
                    await routeSingle(fixture.projectUuid);
                    const user = await compilingUser(fixture.projectUuid);

                    await viewService(fixture.projectUuid).createVirtualView(
                        fromSession(user, 'session-cookie'),
                        fixture.projectUuid,
                        {
                            ...viewPayload,
                            name: 'single_view',
                            warehouseConnectionUuid,
                        },
                        false,
                    );

                    expect(
                        await viewBinding(fixture.projectUuid, 'single_view'),
                    ).toBeNull();
                },
            );

            test('the SQL runner request field names the connection of a new view', async () => {
                const fixture = await createProject();
                const user = await compilingUser(fixture.projectUuid);

                await viewService(fixture.projectUuid).createVirtualView(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                    {
                        ...viewPayload,
                        name: 'request_view',
                        warehouseConnectionUuid: fixture.extraConnectionUuid,
                    },
                );

                expect(
                    await viewBinding(fixture.projectUuid, 'request_view'),
                ).toBe(fixture.extraConnectionUuid);
            });

            test('updating a view bound to an extra connection uses the credentials of that connection and keeps its binding', async () => {
                const fixture = await createProject();
                const [{ project_id: projectId }] = await database('projects')
                    .select('project_id')
                    .where('project_uuid', fixture.projectUuid);
                await database('warehouse_credentials')
                    .where('project_id', projectId)
                    .update({
                        warehouse_type: 'databricks',
                        encrypted_credentials: encryptionUtil.encrypt(
                            JSON.stringify(
                                databricks('original.cloud.databricks.com'),
                            ),
                        ),
                    } as never);
                await database('warehouse_connections')
                    .where(
                        'warehouse_connection_uuid',
                        fixture.extraConnectionUuid,
                    )
                    .update({
                        warehouse_type: 'databricks',
                        encrypted_credentials: encryptionUtil.encrypt(
                            JSON.stringify(
                                databricks('extra.cloud.databricks.com'),
                            ),
                        ),
                    });
                const user = await compilingUser(fixture.projectUuid);
                await database('user_warehouse_credentials').insert({
                    user_uuid: user.userUuid,
                    name: 'Extra workspace',
                    warehouse_type: 'databricks',
                    encrypted_credentials: encryptionUtil.encrypt(
                        JSON.stringify({
                            type: 'databricks',
                            serverHostName: 'extra.cloud.databricks.com',
                            personalAccessToken: 'user-token',
                        }),
                    ),
                } as never);
                await projectModel.createVirtualView(
                    fixture.projectUuid,
                    { ...viewPayload, name: 'finance_view' },
                    warehouseClientFromCredentials(postgresWarehouse(EXTRA_DB)),
                    fixture.extraConnectionUuid,
                );
                const { service } = compileService(fixture.projectUuid);
                Object.assign(service, {
                    userAttributesModel: {
                        getAttributeValuesForOrgMember: async () => ({}),
                    },
                    emailModel: {
                        getPrimaryEmailStatus: async () => ({
                            isVerified: false,
                        }),
                    },
                    analytics: { track: vi.fn(), trackAccount: vi.fn() },
                });

                await service.updateVirtualView(
                    fromSession(user, 'session-cookie'),
                    fixture.projectUuid,
                    'finance_view',
                    { ...viewPayload, name: 'Finance view renamed' },
                    false,
                );

                const [row] = await database('cached_explore')
                    .select('explore', 'warehouse_connection_uuid')
                    .where('project_uuid', fixture.projectUuid)
                    .where('name', 'finance_view');
                expect(row.warehouse_connection_uuid).toBe(
                    fixture.extraConnectionUuid,
                );
                expect(row.explore.label).toBe('Finance view renamed');
            });
        });

        type PreviewCopy = {
            copyPreviewDbtSources: (args: {
                upstreamProjectUuid: string;
                previewProjectUuid: string;
                warehouseConnectionUuidMap: ReadonlyMap<string, string>;
            }) => Promise<void>;
        };

        const emptyProject = () =>
            createProject(
                postgresWarehouse(EXTRA_DB),
                { listAllDatabases: false, additionalDatabases: [] },
                false,
            );

        const sourceRows = async (projectUuid: string) =>
            database('project_dbt_sources')
                .select(
                    'name',
                    'is_primary',
                    'precedence',
                    'dbt_connection_type',
                    'dbt_connection',
                    'warehouse_database',
                    'warehouse_schema',
                    'warehouse_connection_uuid',
                )
                .where('project_uuid', projectUuid)
                .orderBy('precedence');

        test('the preview source copy of a single upstream writes the rows of the main copy', async () => {
            const upstream = await createProject();
            await routeSingle(upstream.projectUuid);
            const viaHelper = await emptyProject();
            const viaMain = await emptyProject();

            await (
                compileService(upstream.projectUuid)
                    .service as unknown as PreviewCopy
            ).copyPreviewDbtSources({
                upstreamProjectUuid: upstream.projectUuid,
                previewProjectUuid: viaHelper.projectUuid,
                warehouseConnectionUuidMap: new Map(),
            });
            await projectDbtSourcesModel.copySources(
                upstream.projectUuid,
                viaMain.projectUuid,
            );

            const copied = await sourceRows(viaHelper.projectUuid);
            expect(copied).toHaveLength(2);
            expect(copied).toEqual(await sourceRows(viaMain.projectUuid));
        });

        test('the preview source copy of a multi upstream remaps each binding through the map and refuses a missing one', async () => {
            const upstream = await createProject();
            const preview = await emptyProject();
            const copy = compileService(upstream.projectUuid)
                .service as unknown as PreviewCopy;

            await expect(
                copy.copyPreviewDbtSources({
                    upstreamProjectUuid: upstream.projectUuid,
                    previewProjectUuid: preview.projectUuid,
                    warehouseConnectionUuidMap: new Map(),
                }),
            ).rejects.toThrow(
                'The copy has no connection for dbt source "finance"',
            );
            expect(await sourceRows(preview.projectUuid)).toEqual([]);

            await copy.copyPreviewDbtSources({
                upstreamProjectUuid: upstream.projectUuid,
                previewProjectUuid: preview.projectUuid,
                warehouseConnectionUuidMap: new Map([
                    [upstream.extraConnectionUuid, preview.extraConnectionUuid],
                ]),
            });
            expect(
                (await sourceRows(preview.projectUuid)).map((row) => [
                    row.name,
                    row.warehouse_connection_uuid,
                ]),
            ).toEqual([
                ['marketing', null],
                ['finance', preview.extraConnectionUuid],
            ]);
        });
    });

    describe('parity with the main save (K1)', () => {
        test('every binding NULL writes rows identical to saveExploreStreamToCache', async () => {
            const inputs: (Explore | ExploreError)[] = [
                explore('orders', ['orders', 'customers']),
                explore('customers', ['customers']),
                explore('orders', ['orders']),
                explore('virtual_orders', ['shadowed']),
                exploreError,
            ];
            const mainProject = await seedProject();
            const multiProject = await seedProject();

            const mainResult = await projectModel.saveExploreStreamToCache(
                mainProject,
                (async function* stream() {
                    yield* inputs;
                })(),
            );
            const multiResult = await projectModel.saveMultiConnectionExplores(
                multiProject,
                (async function* stream() {
                    for (const input of inputs) {
                        yield { explore: input, warehouseConnectionUuid: null };
                    }
                })(),
                { kind: 'connections', warehouseConnectionUuids: [] },
            );

            const mainRows = await dump(mainProject);
            expect(mainRows.map((row) => row.name)).toEqual([
                'broken',
                'customers',
                'orders',
                'virtual_orders',
            ]);
            expect(await dump(multiProject)).toEqual(mainRows);
            expect(multiResult.cachedExploreUuids).toHaveLength(
                mainResult.cachedExploreUuids.length,
            );
        });
    });

    describe('compile groups', () => {
        test('one source on an extra connection keeps both sets and writes the original artifacts', async () => {
            const fixture = await createProject();

            await compile(fixture);
            await compile(fixture);

            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
            const payments = (await cachedExplores(fixture.projectUuid)).find(
                (row) => row.name === 'payments',
            );
            expect(payments?.explore).not.toHaveProperty('errors');
            const cachedWarehouse = await projectModel.getWarehouseFromCache(
                fixture.projectUuid,
            );
            expect(cachedWarehouse?.[ORIGINAL_DB]?.public).toHaveProperty(
                'orders',
            );
            expect(cachedWarehouse).not.toHaveProperty(EXTRA_DB);
            const mergedManifest = JSON.parse(
                gunzipSync(
                    await projectModel.getMergedManifest(fixture.projectUuid),
                ).toString(),
            ) as DbtManifest;
            expect(Object.keys(mergedManifest.nodes).sort()).toEqual([
                'model.marketing.campaigns',
                'model.primary.customers',
                'model.primary.orders',
            ]);
            const extraManifest = await database(
                'warehouse_connection_manifests',
            )
                .where('warehouse_connection_uuid', fixture.extraConnectionUuid)
                .first();
            expect(
                Object.keys(
                    (
                        JSON.parse(
                            gunzipSync(extraManifest.manifest).toString(),
                        ) as DbtManifest
                    ).nodes,
                ),
            ).toEqual(['model.finance.payments']);
            const extraCatalog =
                await warehouseConnectionCompileModel.getCatalogCache(
                    fixture.projectUuid,
                    fixture.extraConnectionUuid,
                );
            expect(extraCatalog?.[EXTRA_DB]?.public).toHaveProperty('payments');
            expect(extraCatalog).not.toHaveProperty(ORIGINAL_DB);
            expect(fetchedWith).toContainEqual({
                source: 'finance',
                dbname: EXTRA_DB,
            });
            expect(fetchedWith).toContainEqual({
                source: 'marketing',
                dbname: ORIGINAL_DB,
            });
        });

        test('rebinding a source from the extra connection to the original makes its explores NULL-bound', async () => {
            const fixture = await createProject();
            await compile(fixture);
            expect((await bindings(fixture.projectUuid)).payments).toBe(
                fixture.extraConnectionUuid,
            );

            await bind(fixture, 'finance', null);
            await compile(fixture);

            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                payments: null,
            });
        });

        test('rebinding a source from the original to the extra connection binds its explores', async () => {
            const fixture = await createProject();
            await compile(fixture);
            expect((await bindings(fixture.projectUuid)).campaigns).toBeNull();

            await bind(fixture, 'marketing', fixture.extraConnectionUuid);
            await compile(fixture);

            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: fixture.extraConnectionUuid,
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
        });

        describe('source failure isolation', () => {
            test.each(['prepare', 'manifest'] as const)(
                '%s failure keeps the source rows unchanged and refreshes healthy sources',
                async (phase) => {
                    const fixture = await createProject();
                    await compile(fixture);
                    const before = await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .first();
                    const refreshedModels = primaryModels.map((model) => ({
                        ...model,
                        label: 'Refreshed',
                    }));
                    const result = await compile(
                        fixture,
                        refreshedModels,
                        postgresWarehouse(ORIGINAL_DB),
                        true,
                        {
                            sources: ['marketing'],
                            phase,
                            crossSourceRefs: true,
                        },
                    );
                    const after = await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .first();
                    expect(after).toEqual(before);
                    expect(
                        (await cachedExplores(fixture.projectUuid)).find(
                            (row) => row.name === 'orders',
                        )?.explore.label,
                    ).toBe('Refreshed');
                    expect(result.warnings).toContainEqual(
                        expect.stringContaining('Source "marketing" failed'),
                    );
                    expect(result.warnings).toContainEqual(
                        expect.stringContaining('kept its 1 explores'),
                    );
                    expect(
                        (await cachedExplores(fixture.projectUuid)).map(
                            (row) => row.name,
                        ),
                    ).toEqual(['campaigns', 'customers', 'orders', 'payments']);
                },
            );

            test.each([
                'unique',
                'ambiguous',
                'other-source',
                'joined-only',
                'no-catalog',
            ] as const)(
                'legacy cached ownership uses only an unambiguous base-table package (%s)',
                async (ownership) => {
                    const fixture = await createProject();
                    await compile(
                        fixture,
                        primaryModels,
                        postgresWarehouse(ORIGINAL_DB),
                        true,
                        {
                            sources: [],
                            phase: 'prepare',
                            crossSourceRefs: true,
                        },
                    );
                    const rows = await cachedExplores(fixture.projectUuid);
                    const campaigns = rows.find(
                        (row) => row.name === 'campaigns',
                    )!.explore as Explore;
                    const table = campaigns.tables[campaigns.baseTable];
                    delete table.dbtSourceUuid;
                    if (ownership === 'other-source')
                        table.dbtSourceUuid = fixture.sourceUuids.finance;
                    if (ownership === 'joined-only') {
                        campaigns.tables.joined = { ...table, name: 'joined' };
                        table.dbtPackageName = 'unmapped';
                    }
                    if (ownership === 'ambiguous') {
                        await database('dbt_source_ref_catalogs')
                            .where({
                                project_uuid: fixture.projectUuid,
                                dbt_source_uuid: fixture.sourceUuids.finance,
                            })
                            .update({
                                project_name: 'marketing',
                                status: 'provisional',
                            });
                    }
                    if (ownership === 'no-catalog') {
                        await database('dbt_source_ref_catalogs')
                            .where('project_uuid', fixture.projectUuid)
                            .delete();
                    }
                    await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .update({ explore: JSON.stringify(campaigns) });
                    const expected = ownership === 'unique' ? 1 : 0;
                    expect(
                        await projectModel.countCachedExploresForDbtSource(
                            fixture.projectUuid,
                            fixture.sourceUuids.marketing,
                        ),
                    ).toBe(expected);
                    const before = await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .first();
                    await projectModel.saveExploreStreamToCache(
                        fixture.projectUuid,
                        (async function* fresh() {
                            yield rows.find((row) => row.name === 'orders')!
                                .explore;
                        })(),
                        undefined,
                        [fixture.sourceUuids.marketing],
                    );
                    const after = await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .first();
                    expect(after).toEqual(expected === 1 ? before : undefined);
                },
            );

            test('all non-primary failures still save the primary and carry both sources', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await cachedExplores(fixture.projectUuid);
                const result = await compile(
                    fixture,
                    primaryModels.map((model) => ({
                        ...model,
                        label: 'Primary refreshed',
                    })),
                    postgresWarehouse(ORIGINAL_DB),
                    true,
                    {
                        sources: ['marketing', 'finance'],
                        phase: 'manifest',
                        crossSourceRefs: false,
                    },
                );
                const after = await cachedExplores(fixture.projectUuid);
                const carriedNames = ['campaigns', 'payments'];
                expect(
                    after.filter((row) => carriedNames.includes(row.name)),
                ).toEqual(
                    before.filter((row) => carriedNames.includes(row.name)),
                );
                expect(after.map((row) => row.name)).toEqual(
                    before.map((row) => row.name),
                );
                expect(
                    after.find((row) => row.name === 'orders')?.explore.label,
                ).toBe('Primary refreshed');
                expect(
                    result.warnings.filter((warning) =>
                        warning.startsWith('Source '),
                    ),
                ).toHaveLength(2);
            });

            test('a source without prior explores contributes no rows and has an explicit warning', async () => {
                const fixture = await createProject();
                const result = await compile(
                    fixture,
                    primaryModels,
                    postgresWarehouse(ORIGINAL_DB),
                    true,
                    {
                        sources: ['marketing'],
                        phase: 'manifest',
                        crossSourceRefs: true,
                    },
                );
                expect(
                    (await cachedExplores(fixture.projectUuid)).map(
                        (row) => row.name,
                    ),
                ).toEqual(['customers', 'orders', 'payments']);
                expect(result.warnings).toContainEqual(
                    expect.stringContaining('nothing was carried'),
                );
            });

            test('a primary failure leaves every cached row unchanged', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await cachedExplores(fixture.projectUuid);
                await expect(
                    compile(
                        fixture,
                        primaryModels,
                        postgresWarehouse(ORIGINAL_DB),
                        true,
                        {
                            sources: ['primary'],
                            phase: 'manifest',
                            crossSourceRefs: true,
                        },
                    ),
                ).rejects.toThrow('Primary parse failed');
                expect(await cachedExplores(fixture.projectUuid)).toEqual(
                    before,
                );
            });

            test('the single-connection stream carries a failed source by its stamp and removes retired healthy models', async () => {
                const fixture = await createProject();
                await compile(fixture);
                const before = await database('cached_explore')
                    .where({
                        project_uuid: fixture.projectUuid,
                        name: 'campaigns',
                    })
                    .first();
                const rows = await cachedExplores(fixture.projectUuid);
                const orders = rows.find(
                    (row) => row.name === 'orders',
                )!.explore;
                const stream = (async function* fresh() {
                    yield { ...orders, label: 'Refreshed' };
                })();
                await projectModel.saveExploreStreamToCache(
                    fixture.projectUuid,
                    stream,
                    undefined,
                    [fixture.sourceUuids.marketing],
                );
                expect(
                    await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'campaigns',
                        })
                        .first(),
                ).toEqual(before);
                expect(
                    (await cachedExplores(fixture.projectUuid)).map(
                        (row) => row.name,
                    ),
                ).toEqual(['campaigns', 'orders']);
            });

            test('error explores with a top-level source stamp survive unchanged', async () => {
                const fixture = await createProject();
                await compile(fixture);
                await database('cached_explore').insert({
                    project_uuid: fixture.projectUuid,
                    name: 'marketing_error',
                    table_names: [],
                    explore: {
                        ...exploreError,
                        name: 'marketing_error',
                        dbtSourceUuid: fixture.sourceUuids.marketing,
                    },
                });
                const before = await database('cached_explore')
                    .where({
                        project_uuid: fixture.projectUuid,
                        name: 'marketing_error',
                    })
                    .first();
                const result = await compile(
                    fixture,
                    primaryModels,
                    postgresWarehouse(ORIGINAL_DB),
                    true,
                    {
                        sources: ['marketing'],
                        phase: 'manifest',
                        crossSourceRefs: true,
                    },
                );
                expect(
                    await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'marketing_error',
                        })
                        .first(),
                ).toEqual(before);
                expect(result.warnings).toContainEqual(
                    expect.stringContaining('kept its 2 explores'),
                );
            });

            test.each(['stamped', 'legacy'] as const)(
                'a fresh model cannot replace a carried %s source model with the same name',
                async (ownership) => {
                    const fixture = await createProject();
                    await compile(
                        fixture,
                        primaryModels,
                        postgresWarehouse(ORIGINAL_DB),
                        true,
                        {
                            sources: [],
                            phase: 'prepare',
                            crossSourceRefs: true,
                        },
                    );
                    if (ownership === 'legacy')
                        await database('cached_explore')
                            .where({
                                project_uuid: fixture.projectUuid,
                                name: 'campaigns',
                            })
                            .update({
                                explore: database.raw(
                                    "explore #- '{tables,campaigns,dbtSourceUuid}'",
                                ),
                            });
                    const before = await cachedExplores(fixture.projectUuid);
                    const fresh = {
                        ...before.find((row) => row.name === 'orders')!.explore,
                        name: 'campaigns',
                    };
                    const stream = (async function* conflicting() {
                        yield fresh;
                    })();
                    await expect(
                        projectModel.saveExploreStreamToCache(
                            fixture.projectUuid,
                            stream,
                            undefined,
                            [fixture.sourceUuids.marketing],
                        ),
                    ).rejects.toThrow(
                        'conflicts with an explore kept from a failed dbt source',
                    );
                    expect(await cachedExplores(fixture.projectUuid)).toEqual(
                        before,
                    );
                },
            );

            test('warnings stay visible on a completed job step and in the compile report', async () => {
                const fixture = await createProject();
                const jobs = new JobModel({ database });
                const jobUuid = randomUUID();
                await jobs.create(
                    {
                        jobUuid,
                        jobType: JobType.COMPILE_PROJECT,
                        projectUuid: fixture.projectUuid,
                        jobStatus: JobStatusType.STARTED,
                        userUuid: undefined,
                        steps: [{ stepType: JobStepType.COMPILING }],
                    },
                    false,
                );
                const result = await jobs.tryJobStep(
                    jobUuid,
                    JobStepType.COMPILING,
                    () =>
                        compile(
                            fixture,
                            primaryModels,
                            postgresWarehouse(ORIGINAL_DB),
                            true,
                            {
                                sources: ['marketing'],
                                phase: 'manifest',
                                crossSourceRefs: true,
                                onWarning: (warning) =>
                                    jobs.appendJobStepWarning(
                                        jobUuid,
                                        JobStepType.COMPILING,
                                        warning,
                                    ),
                            },
                        ),
                );
                await jobs.update(jobUuid, { jobStatus: JobStatusType.DONE });
                const job = await jobs.get(jobUuid);
                expect(job.jobStatus).toBe(JobStatusType.DONE);
                expect(job.steps[0]).toMatchObject({
                    stepStatus: JobStepStatusType.DONE,
                    stepError: expect.stringContaining(
                        'Source "marketing" failed',
                    ),
                });
                const report = withConnectionWarnings(
                    calculateCompilationReport({
                        explores: (
                            await cachedExplores(fixture.projectUuid)
                        ).map((row) => row.explore),
                    }),
                    result.warnings,
                );
                expect(report.connectionWarnings).toContain(
                    job.steps[0].stepError,
                );
                const { organizationUuid } = await projectModel.getSummary(
                    fixture.projectUuid,
                );
                const logs = new ProjectCompileLogModel({ database });
                await logs.insert({
                    projectUuid: fixture.projectUuid,
                    jobUuid,
                    userUuid: null,
                    organizationUuid,
                    compilationSource: 'refresh_dbt',
                    dbtConnectionType: 'github',
                    requestMethod: null,
                    warehouseType: 'postgres',
                    report,
                });
                const persisted = await logs.getLogs({
                    projectUuid: fixture.projectUuid,
                    organizationUuid,
                    sort: { column: 'created_at', direction: 'asc' },
                });
                expect(persisted.data[0].report.connectionWarnings).toEqual(
                    report.connectionWarnings,
                );
            });
        });

        test('a dead extra warehouse keeps its previous explores bound, with a warning, while the others refresh', async () => {
            const fixture = await createProject();
            await compile(fixture);
            const paymentsBefore = (
                await cachedExplores(fixture.projectUuid)
            ).find((row) => row.name === 'payments');
            await warehouseConnectionModel.updateExtraCredentials(
                await warehouseConnectionModel.getProject(fixture.projectUuid),
                fixture.extraConnectionUuid,
                {
                    kind: 'project',
                    credentials: postgresWarehouse(EXTRA_DB, DEAD_PORT),
                },
            );
            const manifestBefore = await database(
                'warehouse_connection_manifests',
            )
                .where('warehouse_connection_uuid', fixture.extraConnectionUuid)
                .first();

            fetchedWith.length = 0;
            const compilation = await compile(fixture, [
                ...primaryModels,
                { name: 'invoices', database: ORIGINAL_DB, table: 'invoices' },
            ]);

            expect(compilation.warnings).toEqual([
                expect.stringContaining(
                    'Connection "Finance warehouse" failed to compile, so its previous explores are kept',
                ),
            ]);
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                invoices: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
            const paymentsAfter = (
                await cachedExplores(fixture.projectUuid)
            ).find((row) => row.name === 'payments');
            expect(paymentsAfter?.explore).toEqual(paymentsBefore?.explore);
            const manifestAfter = await database(
                'warehouse_connection_manifests',
            )
                .where('warehouse_connection_uuid', fixture.extraConnectionUuid)
                .first();
            expect(manifestAfter.manifest).toEqual(manifestBefore.manifest);
            expect(
                fetchedWith.filter(({ source }) => source === 'finance'),
            ).toEqual([]);
        });

        test('a carried source keeps its name when a fresh source introduces the same model', async () => {
            const fixture = await createProject();
            await compile(fixture);
            await warehouseConnectionModel.updateExtraCredentials(
                await warehouseConnectionModel.getProject(fixture.projectUuid),
                fixture.extraConnectionUuid,
                {
                    kind: 'project',
                    credentials: postgresWarehouse(EXTRA_DB, DEAD_PORT),
                },
            );
            sourceManifests.marketing = dbtManifest('marketing', [
                {
                    name: 'campaigns',
                    database: ORIGINAL_DB,
                    table: 'campaigns',
                },
                { name: 'payments', database: ORIGINAL_DB, table: 'payments' },
            ]);

            const compilation = await compile(fixture);

            expect(compilation.warnings).toHaveLength(2);
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
                marketing__payments: null,
            });
        });

        test('after its only source moves to the original, a dead extra warehouse is not contacted and fresh explores replace the carried ones', async () => {
            const fixture = await createProject();
            await compile(fixture);
            await warehouseConnectionModel.updateExtraCredentials(
                await warehouseConnectionModel.getProject(fixture.projectUuid),
                fixture.extraConnectionUuid,
                {
                    kind: 'project',
                    credentials: postgresWarehouse(EXTRA_DB, DEAD_PORT),
                },
            );
            await compile(fixture);
            expect((await bindings(fixture.projectUuid)).payments).toBe(
                fixture.extraConnectionUuid,
            );
            const getCredentials = vi.spyOn(
                compileCredentials,
                'getExtraConnectionWarehouseCredentials',
            );

            await bind(fixture, 'finance', null);
            fetchedWith.length = 0;
            const compilation = await compile(fixture);

            expect(compilation.warnings).toEqual([]);
            expect(getCredentials).not.toHaveBeenCalled();
            expect(fetchedWith).toContainEqual({
                source: 'finance',
                dbname: ORIGINAL_DB,
            });
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                payments: null,
            });
        });

        test('with additional dbt sources off, the original compiles only the primary and extra groups still compile', async () => {
            const fixture = await createProject();

            await compile(
                fixture,
                primaryModels,
                postgresWarehouse(ORIGINAL_DB),
                false,
            );

            expect(await bindings(fixture.projectUuid)).toEqual({
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
            expect(fetchedWith.map(({ source }) => source)).toEqual([
                'finance',
            ]);
            await expect(
                projectModel.getMergedManifest(fixture.projectUuid),
            ).rejects.toThrow();
        });

        test('the compile log names a dead extra connection, and has no connection warnings when every group compiles', async () => {
            const fixture = await createProject();
            const compileLogModel = new ProjectCompileLogModel({ database });
            const { organizationUuid } = await projectModel.getSummary(
                fixture.projectUuid,
            );
            const logCompile = async (warnings: string[]) =>
                compileLogModel.insert({
                    projectUuid: fixture.projectUuid,
                    jobUuid: null,
                    userUuid: null,
                    organizationUuid,
                    compilationSource: 'refresh_dbt',
                    dbtConnectionType: 'github',
                    requestMethod: null,
                    warehouseType: 'postgres',
                    report: withConnectionWarnings(
                        calculateCompilationReport({
                            explores: (
                                await cachedExplores(fixture.projectUuid)
                            ).map((row) => row.explore),
                        }),
                        warnings,
                    ),
                });
            const healthy = await compile(fixture);
            await logCompile(healthy.warnings);
            await warehouseConnectionModel.updateExtraCredentials(
                await warehouseConnectionModel.getProject(fixture.projectUuid),
                fixture.extraConnectionUuid,
                {
                    kind: 'project',
                    credentials: postgresWarehouse(EXTRA_DB, DEAD_PORT),
                },
            );
            const dead = await compile(fixture);
            await logCompile(dead.warnings);

            const logs = await compileLogModel.getLogs({
                organizationUuid,
                projectUuid: fixture.projectUuid,
                sort: { column: 'created_at', direction: 'asc' },
            });
            const [healthyLog, deadLog] = logs.data.map(({ report }) => report);
            expect(healthyLog).not.toHaveProperty('connectionWarnings');
            expect(deadLog.connectionWarnings).toEqual([
                expect.stringContaining(
                    'Connection "Finance warehouse" failed to compile, so its previous explores are kept',
                ),
            ]);
        });

        test('the compile fails when the original connection fails, as on main, and the cache is unchanged', async () => {
            const fixture = await createProject();
            await compile(fixture);
            const before = await cachedExplores(fixture.projectUuid);
            await database('cached_warehouse')
                .where('project_uuid', fixture.projectUuid)
                .delete();

            await expect(
                compile(
                    fixture,
                    primaryModels,
                    postgresWarehouse(ORIGINAL_DB, DEAD_PORT),
                ),
            ).rejects.toThrow();

            expect(await cachedExplores(fixture.projectUuid)).toEqual(before);
        });

        test('a later connection qualifies a colliding explore and keeps the current owner', async () => {
            const fixture = await createProject();
            await compile(fixture);
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'campaigns', database: EXTRA_DB, table: 'campaigns' },
            ]);
            const compilation = await compile(fixture);
            expect(compilation.warnings).toEqual([
                expect.stringContaining('finance__campaigns'),
            ]);
            expect(await bindings(fixture.projectUuid)).toMatchObject({
                campaigns: null,
                finance__campaigns: fixture.extraConnectionUuid,
            });
        });

        test('two sources in one group that define the same model are refused by the manifest merge', async () => {
            const fixture = await createProject();
            await bind(fixture, 'marketing', fixture.extraConnectionUuid);
            sourceManifests.marketing = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
            ]);

            await expect(compile(fixture)).rejects.toThrow(
                'The dbt sources "finance" and "marketing" use the same dbt project name "finance"',
            );
            expect(await cachedExplores(fixture.projectUuid)).toEqual([]);
        });
    });

    describe('listed databases', () => {
        test('a listed database that does not exist is skipped with a warning', async () => {
            const skipped: string[] = [];
            const client = new ListedDatabasesPostgresWarehouseClient(
                postgresWarehouse(EXTRA_DB),
                {
                    listAllDatabases: false,
                    additionalDatabases: [LISTED_DB, MISSING_DB],
                },
                (skippedDatabase) => skipped.push(skippedDatabase),
            );

            const catalog = await client.getCatalogForListedDatabases([
                { database: EXTRA_DB, schema: 'public', table: 'payments' },
                { database: LISTED_DB, schema: 'public', table: 'ledger' },
                { database: MISSING_DB, schema: 'public', table: 'ghost' },
            ]);

            expect(Object.keys(catalog).sort()).toEqual(
                [EXTRA_DB, LISTED_DB].sort(),
            );
            expect(Object.keys(catalog[LISTED_DB].public)).toEqual(['ledger']);
            expect(skipped).toEqual([MISSING_DB]);
        });

        test('a compile reads a listed database and warns about a missing one', async () => {
            const fixture = await createProject(postgresWarehouse(EXTRA_DB), {
                listAllDatabases: false,
                additionalDatabases: [LISTED_DB, MISSING_DB],
            });
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'ledger', database: LISTED_DB, table: 'ledger' },
                { name: 'ghost', database: MISSING_DB, table: 'ghost' },
            ]);

            const compilation = await compile(fixture);

            expect(compilation.warnings).toEqual([
                `Connection "Finance warehouse" skipped listed database "${MISSING_DB}": it does not exist.`,
            ]);
            const catalog =
                await warehouseConnectionCompileModel.getCatalogCache(
                    fixture.projectUuid,
                    fixture.extraConnectionUuid,
                );
            expect(catalog?.[LISTED_DB]?.public).toHaveProperty('ledger');
            expect(catalog?.[EXTRA_DB]?.public).toHaveProperty('payments');
            expect(catalog).not.toHaveProperty(MISSING_DB);
            expect((await bindings(fixture.projectUuid)).ledger).toBe(
                fixture.extraConnectionUuid,
            );
        });
    });

    describe('known missing catalog entries on an extra connection', () => {
        const catalogFetchReasons = (info: ReturnType<typeof vi.spyOn>) =>
            (info.mock.calls as unknown as [string, { reason?: string }?][])
                .filter(
                    ([message]) =>
                        message === 'dbt.compile.warehouseCatalogFetch',
                )
                .map(([, meta]) => meta?.reason);

        const catalogCacheRow = async (fixture: Fixture) =>
            database('warehouse_connection_catalog_cache')
                .where('warehouse_connection_uuid', fixture.extraConnectionUuid)
                .first();

        test('a missing table is stored in the connection catalog cache and only probed on the next compile', async () => {
            const fixture = await createProject();
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'ghost', database: EXTRA_DB, table: 'ghost' },
            ]);
            const info = vi.spyOn(Logger, 'info');

            await compile(fixture);
            const first = await catalogCacheRow(fixture);
            expect(getCatalogMissingEntries(first.warehouse)).toEqual([
                {
                    database: EXTRA_DB,
                    schema: 'public',
                    table: 'ghost',
                    columns: null,
                },
            ]);
            info.mockClear();

            await compile(fixture);

            expect(catalogFetchReasons(info)).toEqual(['known_missing_probe']);
            const second = await catalogCacheRow(fixture);
            expect(second.created_at).toEqual(first.created_at);
            expect(second.warehouse).toEqual(first.warehouse);
            expect((await bindings(fixture.projectUuid)).ghost).toBe(
                fixture.extraConnectionUuid,
            );
        });

        test('a table that appears on the connection is picked up on the next compile with one warning for a missing listed database', async () => {
            const fixture = await createProject(postgresWarehouse(EXTRA_DB), {
                listAllDatabases: false,
                additionalDatabases: [MISSING_DB],
            });
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'late', database: EXTRA_DB, table: 'late_table' },
                { name: 'ghost', database: MISSING_DB, table: 'ghost' },
            ]);
            const info = vi.spyOn(Logger, 'info');
            await compile(fixture);
            const extraWarehouse = knex({
                client: 'pg',
                connection: {
                    ...postgresWarehouse(EXTRA_DB),
                    database: EXTRA_DB,
                },
            });
            try {
                await extraWarehouse.raw(
                    'CREATE TABLE late_table (id integer)',
                );
                info.mockClear();

                const compilation = await compile(fixture);

                expect(catalogFetchReasons(info)).toEqual([
                    'known_missing_probe',
                    'known_missing_changed',
                ]);
                expect(compilation.warnings).toEqual([
                    `Connection "Finance warehouse" skipped listed database "${MISSING_DB}": it does not exist.`,
                ]);
                const row = await catalogCacheRow(fixture);
                expect(row.warehouse[EXTRA_DB].public).toHaveProperty(
                    'late_table',
                );
                expect(getCatalogMissingEntries(row.warehouse)).toEqual([
                    {
                        database: MISSING_DB,
                        schema: 'public',
                        table: 'ghost',
                        columns: null,
                    },
                ]);
            } finally {
                await extraWarehouse.raw('DROP TABLE IF EXISTS late_table');
                await extraWarehouse.destroy();
            }
        });
    });

    describe('explore bindings in API responses', () => {
        const summaryBindings = async (projectUuid: string) =>
            Object.fromEntries(
                (await projectModel.getAllExploreSummaries(projectUuid)).map(
                    (summary) => [
                        summary.name,
                        summary.warehouseConnectionUuid,
                    ],
                ),
            );

        test('the explore summaries and the single explore read each binding from the column', async () => {
            const fixture = await createProject();
            await compile(fixture);

            expect(await summaryBindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
            expect(
                await projectModel.getExploreWarehouseConnectionUuid(
                    fixture.projectUuid,
                    'payments',
                ),
            ).toBe(fixture.extraConnectionUuid);
            expect(
                await projectModel.getExploreWarehouseConnectionUuid(
                    fixture.projectUuid,
                    'orders',
                ),
            ).toBeNull();
            expect(
                await projectModel.getExploreWarehouseConnectionUuid(
                    fixture.projectUuid,
                    'not_cached',
                ),
            ).toBeNull();
        });

        test('a virtual view is created on the connection it is given, and bindings read in one batch', async () => {
            const fixture = await createProject();
            const warehouseClient = warehouseClientFromCredentials(
                postgresWarehouse(EXTRA_DB),
            );
            const payload = {
                sql: 'SELECT 1 AS amount',
                columns: [
                    {
                        reference: 'amount',
                        type: DimensionType.NUMBER,
                    },
                ],
            };

            await projectModel.createVirtualView(
                fixture.projectUuid,
                { ...payload, name: 'finance_view' },
                warehouseClient,
                fixture.extraConnectionUuid,
            );
            await projectModel.createVirtualView(
                fixture.projectUuid,
                { ...payload, name: 'original_view' },
                warehouseClient,
                null,
            );
            await projectModel.updateVirtualView(
                fixture.projectUuid,
                'finance_view',
                { ...payload, name: 'Finance view renamed' },
                warehouseClient,
            );

            expect(
                await projectModel.findExploreWarehouseConnectionUuids(
                    fixture.projectUuid,
                    ['finance_view', 'original_view', 'not_cached'],
                ),
            ).toEqual({
                finance_view: fixture.extraConnectionUuid,
                original_view: null,
                not_cached: null,
            });
        });

        test('a connection uuid inside the explore JSON is not the binding', async () => {
            const fixture = await createProject();
            const other = await createProject();
            await database('cached_explore').insert({
                project_uuid: fixture.projectUuid,
                name: 'stamped',
                table_names: ['stamped'],
                explore: JSON.stringify({
                    ...explore('stamped', ['stamped']),
                    connectionUuid: other.extraConnectionUuid,
                    warehouseConnectionUuid: other.extraConnectionUuid,
                }),
            } as never);

            expect(await summaryBindings(fixture.projectUuid)).toEqual({
                stamped: null,
            });
            expect(
                await projectModel.getExploreWarehouseConnectionUuid(
                    fixture.projectUuid,
                    'stamped',
                ),
            ).toBeNull();
        });
    });

    describe('stable explore names', () => {
        const deployedModel = (packageName: string, name: string): Explore => {
            const deployed = explore(name, [name]);
            return {
                ...deployed,
                dbtModelIdentity: {
                    sourceUuid: null,
                    sourceName: null,
                    packageName,
                    uniqueId: `model.${packageName}.${name}`,
                    modelName: name,
                },
                tables: {
                    [name]: {
                        ...deployed.tables[name],
                        dbtPackageName: packageName,
                        dbtModelUniqueId: `model.${packageName}.${name}`,
                    },
                },
            };
        };
        const sourceDeploy = async (
            fixture: Fixture,
            source: string | null,
            models: Explore[],
        ) => {
            const prepared = await compiler.prepareSourceDeploy({
                projectUuid: fixture.projectUuid,
                projectDbtSourceUuid:
                    source === null ? null : fixture.sourceUuids[source],
                explores: models,
            });
            await compiler.save(fixture.projectUuid, prepared);
            return prepared;
        };
        const allocations = (fixture: Fixture) =>
            database('explore_name_allocations')
                .where('project_uuid', fixture.projectUuid)
                .orderBy('name');
        const freshCompiler = () =>
            new MultiConnectionCompiler({
                dbtSourceRefCatalogModel: new DbtSourceRefCatalogModel({
                    database,
                }),
                projectModel,
                projectDbtSourcesModel,
                warehouseConnectionCompileModel,
                warehouseClientFactory:
                    compileCredentials.warehouseClientFactory,
            });
        const expectReservedWarnings = (
            warnings: string[] | undefined,
            assignedNames: string[],
            qualifiedNames: string[],
        ) => {
            expect(warnings).toHaveLength(assignedNames.length);
            for (const name of assignedNames)
                expect(warnings).toContainEqual(
                    expect.stringContaining(
                        `is assigned explore name "${name}"`,
                    ),
                );
            for (const warning of warnings ?? []) {
                expect(warning).toMatch(
                    /plain name "orders" is reserved because of an unresolved collision/i,
                );
                expect(warning).toMatch(/qualified explore names:/i);
                const qualifiedList = warning.slice(
                    warning.toLowerCase().indexOf('qualified explore names:'),
                );
                let previousIndex = -1;
                for (const name of [...qualifiedNames].sort()) {
                    const index = qualifiedList.indexOf(`"${name}"`);
                    expect(index).toBeGreaterThan(previousIndex);
                    previousIndex = index;
                }
            }
        };

        test.each([false, true])(
            'publishes only the latest version of each colliding source model without false allocation collisions (saved owner %s)',
            async (savedOwner) => {
                const fixture = await createProject();
                await projectModel.updateDbtSourceName(
                    fixture.projectUuid,
                    'analytics',
                );
                await bind(fixture, 'finance', null);
                const primary = await projectModel.getDbtSourceIdentity(
                    fixture.projectUuid,
                );
                const sources = [
                    { name: 'analytics', uuid: primary.dbtSourceUuid },
                    { name: 'finance', uuid: fixture.sourceUuids.finance },
                ];
                const models = sources.flatMap((source) => {
                    const [model] = getModelsFromManifest(
                        dbtManifest(source.name, [
                            {
                                name: 'orders',
                                database: ORIGINAL_DB,
                                table: 'orders',
                            },
                        ]),
                    );
                    return [1, 2].map((version) => ({
                        ...model,
                        unique_id: `model.${source.name}.orders.v${version}`,
                        version,
                        latest_version: 2,
                        alias: `orders_v${version}`,
                        relation_name: `${source.name}.orders_v${version}`,
                        lightdash_source_name: source.name,
                        lightdash_source_uuid: source.uuid,
                    }));
                });
                const warehouse = knex({
                    client: 'pg',
                    connection: {
                        ...postgresWarehouse(ORIGINAL_DB),
                        database: ORIGINAL_DB,
                    },
                });
                try {
                    await Promise.all(
                        sources.map(async (source) => {
                            await warehouse.raw(
                                'CREATE SCHEMA IF NOT EXISTS ??',
                                [source.name],
                            );
                            await Promise.all(
                                [1, 2].map(async (version) => {
                                    await warehouse.raw(
                                        'CREATE TABLE IF NOT EXISTS ??.?? (id integer, amount numeric)',
                                        [source.name, `orders_v${version}`],
                                    );
                                    await warehouse
                                        .withSchema(source.name)
                                        .table(`orders_v${version}`)
                                        .delete();
                                    await warehouse
                                        .withSchema(source.name)
                                        .table(`orders_v${version}`)
                                        .insert({
                                            id: version,
                                            amount:
                                                (source.name === 'analytics'
                                                    ? 100
                                                    : 200) + version,
                                        });
                                }),
                            );
                        }),
                    );
                    const publish = async (
                        versions: number[],
                        sourceNames = sources.map((source) => source.name),
                    ) => {
                        const selected = models.filter(
                            (model) =>
                                versions.includes(model.version) &&
                                sourceNames.includes(
                                    model.lightdash_source_name,
                                ),
                        );
                        const compiled = await convertExplores(
                            selected,
                            false,
                            SupportedDbtAdapter.POSTGRES,
                            warehouseSqlBuilderFromType(
                                SupportedDbtAdapter.POSTGRES,
                            ),
                            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                            { deferExploreNaming: true },
                        );
                        expect(
                            compiled.every((item) => !isExploreError(item)),
                        ).toBe(true);
                        await compiler.save(fixture.projectUuid, {
                            exploreStream:
                                (async function* versionedExplores() {
                                    yield* compiled;
                                })(),
                            bindingOf: () => null,
                            carry: {
                                kind: 'connections',
                                warehouseConnectionUuids: [],
                            },
                            naming: {
                                mode: 'refresh',
                                models: selected.map((model) => ({
                                    sourceUuid: model.lightdash_source_uuid,
                                    sourceName: model.lightdash_source_name,
                                    packageName: model.package_name,
                                    uniqueId: model.unique_id,
                                    version: model.version,
                                    latestVersion: model.latest_version,
                                    modelName: model.name,
                                })),
                                refreshedSourceUuids: sources.map(
                                    (source) => source.uuid,
                                ),
                                warnings: [],
                            },
                            persistArtifacts: async () => {},
                        });
                        const rows = await cachedExplores(fixture.projectUuid);
                        const expectedNames = sourceNames
                            .map((name) =>
                                savedOwner && name === 'analytics'
                                    ? 'orders'
                                    : `${name}__orders`,
                            )
                            .sort();
                        expect(rows.map(({ name }) => name)).toEqual(
                            expectedNames,
                        );
                        expect(
                            rows.every(
                                ({ explore: item }) => !isExploreError(item),
                            ),
                        ).toBe(true);
                        const version = versions.at(-1)!;
                        await Promise.all(
                            sources
                                .filter((candidate) =>
                                    sourceNames.includes(candidate.name),
                                )
                                .map(async (source) => {
                                    const saved =
                                        await projectModel.getExploreFromCache(
                                            fixture.projectUuid,
                                            savedOwner &&
                                                source.name === 'analytics'
                                                ? 'orders'
                                                : `${source.name}__orders`,
                                        );
                                    const table =
                                        saved.tables![saved.baseTable!];
                                    expect(table.sqlTable).toBe(
                                        `${source.name}.orders_v${version}`,
                                    );
                                    expect(table.dbtSourceUuid).toBe(
                                        source.uuid,
                                    );
                                    expect(table.dbtModelUniqueId).toBe(
                                        `model.${source.name}.orders.v${version}`,
                                    );
                                    expect(
                                        (
                                            await warehouse.raw(
                                                `SELECT id, amount FROM ${table.sqlTable}`,
                                            )
                                        ).rows,
                                    ).toEqual([
                                        {
                                            id: version,
                                            amount:
                                                (source.name === 'analytics'
                                                    ? 100
                                                    : 200) + version,
                                        },
                                    ]);
                                }),
                        );
                        const names = await allocations(fixture);
                        expect(
                            names.map(({ name, is_reserved }) => ({
                                name,
                                is_reserved,
                            })),
                        ).toEqual(
                            [
                                ...expectedNames.map((name) => ({
                                    name,
                                    is_reserved: false,
                                })),
                                ...(!savedOwner
                                    ? [{ name: 'orders', is_reserved: true }]
                                    : []),
                            ].sort((left, right) =>
                                left.name.localeCompare(right.name),
                            ),
                        );
                        expect(
                            names
                                .filter(({ is_reserved }) => !is_reserved)
                                .map(({ model_unique_id }) => model_unique_id)
                                .sort(),
                        ).toEqual(
                            sourceNames
                                .map(
                                    (name) =>
                                        `model.${name}.orders.v${version}`,
                                )
                                .sort(),
                        );
                    };
                    if (savedOwner) await publish([1], ['analytics']);
                    await publish([1]);
                    const priorOwners = await allocations(fixture);
                    await publish([1, 2]);
                    const upgradedOwners = await allocations(fixture);
                    expect(
                        upgradedOwners.map(
                            ({
                                name,
                                explore_name_allocation_uuid,
                                source_key,
                                is_reserved,
                            }) => ({
                                name,
                                explore_name_allocation_uuid,
                                source_key,
                                is_reserved,
                            }),
                        ),
                    ).toEqual(
                        priorOwners.map(
                            ({
                                name,
                                explore_name_allocation_uuid,
                                source_key,
                                is_reserved,
                            }) => ({
                                name,
                                explore_name_allocation_uuid,
                                source_key,
                                is_reserved,
                            }),
                        ),
                    );
                    const before = await allocations(fixture);
                    await publish([1, 2]);
                    expect(await allocations(fixture)).toEqual(before);
                } finally {
                    await warehouse.destroy();
                }
            },
        );

        test.each(['refresh', 'deploy'] as const)(
            'keeps an unresolved plain-name reservation when a third source arrives through %s',
            async (operation) => {
                const fixture = await createProject();
                sourceManifests.finance = dbtManifest('finance', [
                    { name: 'orders', database: EXTRA_DB, table: 'payments' },
                ]);
                sourceManifests.marketing = dbtManifest('marketing', [
                    { name: 'orders', database: ORIGINAL_DB, table: 'orders' },
                ]);
                const initialNames = ['finance__orders', 'marketing__orders'];
                const initial = await compile(fixture, [primaryModels[1]]);
                expectReservedWarnings(
                    initial.warnings,
                    initialNames,
                    initialNames,
                );
                const before = await allocations(fixture);
                const reservation = before.find(
                    ({ name }) => name === 'orders',
                );
                expect(reservation).toMatchObject({
                    name: 'orders',
                    model_name: 'orders',
                    is_reserved: true,
                });
                expect(before.filter(({ is_reserved }) => is_reserved)).toEqual(
                    [reservation],
                );
                expect(
                    before
                        .filter(({ is_reserved }) => !is_reserved)
                        .map(({ name, is_reserved }) => ({
                            name,
                            is_reserved,
                        })),
                ).toEqual([
                    { name: 'customers', is_reserved: false },
                    { name: 'finance__orders', is_reserved: false },
                    { name: 'marketing__orders', is_reserved: false },
                ]);
                const beforeBindings = {
                    customers: null,
                    finance__orders: fixture.extraConnectionUuid,
                    marketing__orders: null,
                };
                expect(await bindings(fixture.projectUuid)).toEqual(
                    beforeBindings,
                );
                compiler = freshCompiler();
                const repeated = await compile(fixture, [primaryModels[1]]);
                expectReservedWarnings(
                    repeated.warnings,
                    initialNames,
                    initialNames,
                );
                expect(await allocations(fixture)).toEqual(before);
                expect(await bindings(fixture.projectUuid)).toEqual(
                    beforeBindings,
                );

                const { dbtSourceName } =
                    await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                const primaryName = `${dbtSourceName}__orders`;
                const qualifiedNames = [...initialNames, primaryName].sort();
                const warnings =
                    operation === 'refresh'
                        ? (await compile(fixture)).warnings
                        : (
                              await sourceDeploy(fixture, null, [
                                  deployedModel('primary', 'orders'),
                                  deployedModel('primary', 'customers'),
                              ])
                          ).naming?.warnings;
                expectReservedWarnings(
                    warnings,
                    operation === 'refresh' ? qualifiedNames : [primaryName],
                    qualifiedNames,
                );
                expect(await bindings(fixture.projectUuid)).toEqual({
                    ...beforeBindings,
                    [primaryName]: null,
                });
                const after = await allocations(fixture);
                expect(after.find(({ name }) => name === 'orders')).toEqual(
                    reservation,
                );
                expect(after.filter(({ is_reserved }) => is_reserved)).toEqual([
                    reservation,
                ]);
                expect(
                    after.filter(
                        ({ model_name, is_reserved }) =>
                            model_name === 'orders' && !is_reserved,
                    ),
                ).toHaveLength(3);
                for (const owner of before.filter(
                    ({ is_reserved }) => !is_reserved,
                ))
                    expect(
                        after.find(({ name }) => name === owner.name),
                    ).toEqual(owner);
                expect(
                    after.find(({ name }) => name === primaryName),
                ).toMatchObject({
                    source_key: 'primary',
                    model_unique_id: 'model.primary.orders',
                    is_reserved: false,
                });
                compiler = freshCompiler();
                if (operation === 'refresh') await compile(fixture);
                else
                    await sourceDeploy(fixture, null, [
                        deployedModel('primary', 'orders'),
                        deployedModel('primary', 'customers'),
                    ]);
                expect(await allocations(fixture)).toEqual(after);
                expect(await bindings(fixture.projectUuid)).toEqual({
                    ...beforeBindings,
                    [primaryName]: null,
                });
            },
        );

        test('a third-source deploy seeds a reservation from cached qualified owners without renaming them', async () => {
            const fixture = await createProject();
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            sourceManifests.marketing = dbtManifest('marketing', [
                { name: 'orders', database: ORIGINAL_DB, table: 'orders' },
            ]);
            await compile(fixture, [primaryModels[1]]);
            await database('explore_name_allocations')
                .where('project_uuid', fixture.projectUuid)
                .delete();
            expect(await allocations(fixture)).toEqual([]);
            const before = await database('cached_explore')
                .select(
                    'cached_explore_uuid',
                    'name',
                    'explore',
                    'warehouse_connection_uuid',
                )
                .where('project_uuid', fixture.projectUuid)
                .whereIn('name', ['finance__orders', 'marketing__orders'])
                .orderBy('name');
            expect(before.map(({ name }) => name)).toEqual([
                'finance__orders',
                'marketing__orders',
            ]);
            compiler = freshCompiler();
            const { dbtSourceName } = await projectModel.getDbtSourceIdentity(
                fixture.projectUuid,
            );
            const primaryName = `${dbtSourceName}__orders`;
            const deployed = [
                deployedModel('primary', 'orders'),
                deployedModel('primary', 'customers'),
            ];
            const prepared = await sourceDeploy(fixture, null, deployed);
            expect(deployed.map(({ name }) => name).sort()).toEqual(
                ['customers', primaryName].sort(),
            );
            expectReservedWarnings(
                prepared.naming?.warnings,
                [primaryName],
                ['finance__orders', 'marketing__orders', primaryName],
            );
            expect(await bindings(fixture.projectUuid)).toEqual({
                customers: null,
                finance__orders: fixture.extraConnectionUuid,
                marketing__orders: null,
                [primaryName]: null,
            });
            expect(
                await database('cached_explore')
                    .select(
                        'cached_explore_uuid',
                        'name',
                        'explore',
                        'warehouse_connection_uuid',
                    )
                    .where('project_uuid', fixture.projectUuid)
                    .whereIn('name', ['finance__orders', 'marketing__orders'])
                    .orderBy('name'),
            ).toEqual(before);
            const seeded = await allocations(fixture);
            const reservation = seeded.find(({ name }) => name === 'orders');
            expect(reservation).toMatchObject({
                name: 'orders',
                model_name: 'orders',
                is_reserved: true,
            });
            expect(seeded.filter(({ is_reserved }) => is_reserved)).toEqual([
                reservation,
            ]);
            expect(
                seeded.filter(({ is_reserved }) => !is_reserved),
            ).toMatchObject(
                [
                    { name: 'customers', is_reserved: false },
                    {
                        name: 'finance__orders',
                        source_key: fixture.sourceUuids.finance,
                        is_reserved: false,
                    },
                    {
                        name: 'marketing__orders',
                        source_key: fixture.sourceUuids.marketing,
                        is_reserved: false,
                    },
                    {
                        name: primaryName,
                        source_key: 'primary',
                        is_reserved: false,
                    },
                ].sort((left, right) => left.name.localeCompare(right.name)),
            );
            await sourceDeploy(fixture, null, [
                deployedModel('primary', 'orders'),
                deployedModel('primary', 'customers'),
            ]);
            expect(await allocations(fixture)).toEqual(seeded);
        });

        test.each(['refresh', 'deploy'] as const)(
            'qualifies a newcomer through %s and keeps the saved owner',
            async (operation) => {
                const fixture = await createProject();
                await compile(fixture);
                const owner = await database('cached_explore')
                    .where({
                        project_uuid: fixture.projectUuid,
                        name: 'orders',
                    })
                    .first();
                if (!owner) throw new Error('Missing orders explore');
                sourceManifests.finance = dbtManifest('finance', [
                    { name: 'orders', database: EXTRA_DB, table: 'payments' },
                ]);
                const warnings =
                    operation === 'refresh'
                        ? (await compile(fixture)).warnings
                        : (
                              await sourceDeploy(fixture, 'finance', [
                                  deployedModel('finance', 'orders'),
                              ])
                          ).naming?.warnings;
                expect(await bindings(fixture.projectUuid)).toMatchObject({
                    orders: null,
                    finance__orders: fixture.extraConnectionUuid,
                });
                expect(warnings).toEqual([
                    expect.stringContaining(
                        'is assigned explore name "finance__orders"',
                    ),
                ]);
                expect(warnings?.[0]).toContain('model.primary.orders');
                const deployed = [deployedModel('finance', 'orders')];
                const prepared = await sourceDeploy(
                    fixture,
                    'finance',
                    deployed,
                );
                expect(deployed[0].name).toBe('finance__orders');
                expect(prepared.naming?.warnings).toEqual(warnings);
                expect(
                    (
                        await database('cached_explore')
                            .where({
                                project_uuid: fixture.projectUuid,
                                name: 'orders',
                            })
                            .first()
                    )?.cached_explore_uuid,
                ).toBe(owner.cached_explore_uuid);
                expect(
                    (await allocations(fixture)).filter(
                        (row) => row.name === 'orders',
                    ),
                ).toMatchObject([
                    {
                        model_unique_id: 'model.primary.orders',
                        source_key: 'primary',
                    },
                ]);
                expect(
                    JSON.stringify(await cachedExplores(fixture.projectUuid)),
                ).not.toContain('__model_');
            },
        );

        test('uses the configured namespace for a newcomer in a multi-source extra group', async () => {
            const fixture = await createProject();
            await compile(fixture);
            const owner = await database('cached_explore')
                .where({ project_uuid: fixture.projectUuid, name: 'orders' })
                .first();
            if (!owner) throw new Error('Missing orders explore');

            const billingSource = await projectDbtSourcesModel.updateSource(
                fixture.sourceUuids.finance,
                { name: 'billing' },
            );
            await bind(fixture, 'marketing', fixture.extraConnectionUuid);
            sourceManifests.billing = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            sourceManifests.marketing = dbtManifest('marketing', [
                { name: 'campaigns', database: EXTRA_DB, table: 'campaigns' },
            ]);

            const compilation = await compile(fixture);
            expect(await bindings(fixture.projectUuid)).toEqual({
                billing__orders: fixture.extraConnectionUuid,
                campaigns: fixture.extraConnectionUuid,
                customers: null,
                orders: null,
            });
            expect(compilation.warnings).toEqual([
                expect.stringContaining(
                    'is assigned explore name "billing__orders"',
                ),
            ]);
            expect(compilation.warnings[0]).toContain('model.primary.orders');
            expect(
                (await allocations(fixture)).find(
                    ({ name }) => name === 'billing__orders',
                ),
            ).toMatchObject({
                source_key: billingSource.projectDbtSourceUuid,
                source_name: 'billing',
                package_name: 'finance',
                model_unique_id: 'model.finance.orders',
                model_name: 'orders',
            });
            const published = await cachedExplores(fixture.projectUuid);
            expect(
                published.filter(({ explore: cached }) =>
                    isExploreError(cached),
                ),
            ).toEqual([]);
            expect(
                published.find(({ name }) => name === 'billing__orders')
                    ?.explore,
            ).toMatchObject({
                dbtModelIdentity: {
                    sourceUuid: billingSource.projectDbtSourceUuid,
                    sourceName: 'billing',
                    packageName: 'finance',
                    uniqueId: 'model.finance.orders',
                    modelName: 'orders',
                },
                warnings: [
                    {
                        type: 'EXPLORE_NAME_COLLISION',
                        message: compilation.warnings[0],
                    },
                ],
            });
            expect(
                (
                    await database('cached_explore')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'orders',
                        })
                        .first()
                )?.cached_explore_uuid,
            ).toBe(owner.cached_explore_uuid);
        });

        test('keeps a saved extra-source bare name when the primary model appears', async () => {
            const fixture = await createProject();
            await compile(fixture, [primaryModels[1]]);
            await sourceDeploy(fixture, 'finance', [
                deployedModel('finance', 'orders'),
            ]);
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            const { dbtSourceName } = await projectModel.getDbtSourceIdentity(
                fixture.projectUuid,
            );
            await compile(fixture);
            expect(await bindings(fixture.projectUuid)).toMatchObject({
                orders: fixture.extraConnectionUuid,
                [`${dbtSourceName}__orders`]: null,
            });
            const deployed = [
                deployedModel('primary', 'orders'),
                deployedModel('primary', 'customers'),
            ];
            await sourceDeploy(fixture, null, deployed);
            expect(deployed.map((model) => model.name).sort()).toEqual([
                'customers',
                `${dbtSourceName}__orders`,
            ]);
        });

        test.each([
            { reverseSources: false, reverseNodes: false },
            { reverseSources: true, reverseNodes: false },
            { reverseSources: false, reverseNodes: true },
            { reverseSources: true, reverseNodes: true },
        ])(
            'qualifies all unsaved owners regardless of source and manifest order (sources $reverseSources, nodes $reverseNodes)',
            async ({ reverseSources, reverseNodes }) => {
                const fixture = await createProject();
                await bind(fixture, 'finance', null);
                const sourceOrder = reverseSources
                    ? ['finance', 'marketing']
                    : ['marketing', 'finance'];
                await Promise.all(
                    sourceOrder.map((source, index) =>
                        database('project_dbt_sources')
                            .where(
                                'project_dbt_source_uuid',
                                fixture.sourceUuids[source],
                            )
                            .update({ precedence: index + 1 }),
                    ),
                );
                for (const source of sourceOrder) {
                    const models: FixtureModel[] = [
                        {
                            name: 'orders',
                            database: ORIGINAL_DB,
                            table: 'orders',
                        },
                        {
                            name:
                                source === 'finance' ? 'payments' : 'campaigns',
                            database: ORIGINAL_DB,
                            table:
                                source === 'finance' ? 'payments' : 'campaigns',
                        },
                    ];
                    sourceManifests[source] = dbtManifest(
                        source,
                        reverseNodes ? models.reverse() : models,
                    );
                    expect(Object.keys(sourceManifests[source].nodes)).toEqual(
                        models.map(({ name }) => `model.${source}.${name}`),
                    );
                }
                expect(
                    (
                        await projectDbtSourcesModel.getSourcesWithBindings(
                            fixture.projectUuid,
                        )
                    ).map(({ name }) => name),
                ).toEqual(sourceOrder);
                expect(await allocations(fixture)).toEqual([]);
                expect(await cachedExplores(fixture.projectUuid)).toEqual([]);

                const compilation = await compile(fixture, [primaryModels[1]]);
                expect(fetchedWith.map(({ source }) => source)).toEqual(
                    sourceOrder,
                );
                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    customers: null,
                    finance__orders: null,
                    marketing__orders: null,
                    payments: null,
                });
                expectReservedWarnings(
                    compilation.warnings,
                    ['finance__orders', 'marketing__orders'],
                    ['finance__orders', 'marketing__orders'],
                );
                const publishedAllocations = await allocations(fixture);
                const publishedExplores = await cachedExplores(
                    fixture.projectUuid,
                );
                for (const source of sourceOrder) {
                    expect(
                        publishedAllocations.find(
                            ({ name }) => name === `${source}__orders`,
                        ),
                    ).toMatchObject({
                        source_key: fixture.sourceUuids[source],
                        model_unique_id: `model.${source}.orders`,
                        model_name: 'orders',
                        is_reserved: false,
                    });
                    expect(
                        publishedExplores.find(
                            ({ name }) => name === `${source}__orders`,
                        )?.explore,
                    ).toMatchObject({
                        dbtModelIdentity: {
                            sourceUuid: fixture.sourceUuids[source],
                        },
                        warnings: [{ type: 'EXPLORE_NAME_COLLISION' }],
                    });
                }
                const reservation = publishedAllocations.find(
                    ({ name }) => name === 'orders',
                );
                expect(reservation).toMatchObject({
                    name: 'orders',
                    model_name: 'orders',
                    is_reserved: true,
                });
                expect(
                    publishedAllocations.filter(
                        ({ is_reserved }) => is_reserved,
                    ),
                ).toEqual([reservation]);
                const before = await allocations(fixture);
                await compile(fixture, [primaryModels[1]]);
                expect(await allocations(fixture)).toEqual(before);
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );

                const removedSource = reverseSources ? 'finance' : 'marketing';
                const survivingSource = reverseSources
                    ? 'marketing'
                    : 'finance';
                const remainingModel =
                    removedSource === 'finance' ? 'payments' : 'campaigns';
                sourceManifests[removedSource] = dbtManifest(removedSource, [
                    {
                        name: remainingModel,
                        database: ORIGINAL_DB,
                        table: remainingModel,
                    },
                ]);
                await compile(fixture, [primaryModels[1]]);
                const survivingOwner = before.find(
                    ({ name }) => name === `${survivingSource}__orders`,
                );
                expect(
                    (await allocations(fixture)).filter(
                        ({ model_name }) => model_name === 'orders',
                    ),
                ).toEqual([survivingOwner, reservation]);
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    `${removedSource}__orders`,
                );
                await database('project_dbt_sources')
                    .where(
                        'project_dbt_source_uuid',
                        fixture.sourceUuids[removedSource],
                    )
                    .delete();
                await compile(fixture, [primaryModels[1]]);
                expect(
                    (await allocations(fixture)).filter(
                        ({ model_name }) => model_name === 'orders',
                    ),
                ).toEqual([survivingOwner, reservation]);
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );
                expect(await bindings(fixture.projectUuid)).toHaveProperty(
                    `${survivingSource}__orders`,
                );

                await compile(fixture);
                const { dbtSourceName } =
                    await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                const primaryName = `${dbtSourceName}__orders`;
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === 'orders',
                    ),
                ).toEqual(reservation);
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === primaryName,
                    ),
                ).toMatchObject({
                    source_key: 'primary',
                    model_unique_id: 'model.primary.orders',
                    is_reserved: false,
                });
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === `${survivingSource}__orders`,
                    ),
                ).toEqual(survivingOwner);
                expect(await bindings(fixture.projectUuid)).toMatchObject({
                    [primaryName]: null,
                    [`${survivingSource}__orders`]: null,
                });
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );

                await compile(fixture, [primaryModels[1]]);
                await database('project_dbt_sources')
                    .where(
                        'project_dbt_source_uuid',
                        fixture.sourceUuids[survivingSource],
                    )
                    .delete();
                await compile(fixture, [primaryModels[1]]);
                expect(
                    (await allocations(fixture)).filter(
                        ({ model_name }) => model_name === 'orders',
                    ),
                ).toEqual([reservation]);
                expect(await bindings(fixture.projectUuid)).toEqual({
                    customers: null,
                });
                compiler = freshCompiler();
                const singleton = await compile(fixture);
                expectReservedWarnings(
                    singleton.warnings,
                    ['primary__orders'],
                    ['primary__orders'],
                );
                expect(await bindings(fixture.projectUuid)).toEqual({
                    customers: null,
                    primary__orders: null,
                });
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === 'orders',
                    ),
                ).toEqual(reservation);
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === 'primary__orders',
                    ),
                ).toMatchObject({
                    source_key: 'primary',
                    model_unique_id: 'model.primary.orders',
                    is_reserved: false,
                });
            },
        );

        test.each([
            { qualified: false, legacy: false },
            { qualified: true, legacy: false },
            { qualified: true, legacy: true },
        ])(
            'a source deploy keeps the joined provider owner (qualified $qualified, legacy $legacy)',
            async ({ qualified, legacy }) => {
                const fixture = await createProject();
                await compile(fixture);
                const { dbtSourceUuid, dbtSourceName } =
                    await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                const providerName = qualified
                    ? `${dbtSourceName}__orders`
                    : 'orders';
                const owner = await database('cached_explore')
                    .where({
                        project_uuid: fixture.projectUuid,
                        name: 'orders',
                    })
                    .first();
                if (!owner) throw new Error('Missing orders explore');
                if (qualified) {
                    const renamed = rewriteAllocatedExplore(
                        owner.explore,
                        new Map([['orders', providerName]]),
                    );
                    if (!renamed.tables)
                        throw new Error('Missing orders tables');
                    renamed.tables[providerName].originalName = 'orders';
                    if (legacy) {
                        delete renamed.dbtModelIdentity;
                        delete renamed.tables[providerName].dbtModelUniqueId;
                        delete renamed.tables[providerName].dbtSourceName;
                    }
                    await database('cached_explore')
                        .where('cached_explore_uuid', owner.cached_explore_uuid)
                        .update({
                            name: providerName,
                            explore: JSON.stringify(renamed),
                            table_names: [providerName],
                        });
                    await database('explore_name_allocations')
                        .where({
                            project_uuid: fixture.projectUuid,
                            name: 'orders',
                        })
                        .update({ name: providerName });
                }
                if (legacy)
                    await database('explore_name_allocations')
                        .where('project_uuid', fixture.projectUuid)
                        .delete();
                const beforeOwner = await database('cached_explore')
                    .where('cached_explore_uuid', owner.cached_explore_uuid)
                    .first();
                const beforeAllocation = (await allocations(fixture)).find(
                    (row) => row.name === providerName,
                );
                const servedModels = getModelsFromManifest(
                    dbtManifest('primary', [primaryModels[0]]),
                ).map((model) => ({
                    ...model,
                    lightdash_source_uuid: dbtSourceUuid,
                    lightdash_source_name: dbtSourceName,
                }));
                const localModels = getModelsFromManifest(
                    dbtManifest('marketing', primaryModels),
                ).map((model) => ({
                    ...model,
                    lightdash_source_uuid: fixture.sourceUuids.marketing,
                    lightdash_source_name: 'marketing',
                    meta:
                        model.name === 'customers'
                            ? {
                                  ...model.meta,
                                  joins: [
                                      {
                                          join: `${dbtSourceName}__orders`,
                                          alias: 'purchased_orders',
                                          sql_on: '${customers.id} = ${purchased_orders.id}',
                                      },
                                  ],
                              }
                            : model.meta,
                }));
                const compiled = await convertExplores(
                    [...servedModels, ...localModels],
                    false,
                    SupportedDbtAdapter.POSTGRES,
                    warehouseSqlBuilderFromType(SupportedDbtAdapter.POSTGRES),
                    { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
                    { includeModelIdentity: true },
                );
                const customers = compiled.find(
                    (candidate) => candidate.name === 'customers',
                );
                if (!customers || isExploreError(customers))
                    throw new Error(JSON.stringify(customers));
                expect(customers.tables.purchased_orders.dbtSourceUuid).toBe(
                    dbtSourceUuid,
                );
                if (legacy) {
                    delete customers.tables.purchased_orders.dbtModelUniqueId;
                    delete customers.tables.purchased_orders.dbtSourceUuid;
                    delete customers.tables.purchased_orders.dbtSourceName;
                }
                customers.tables.customers.dbtSourceUuid = dbtSourceUuid;
                if (customers.dbtModelIdentity)
                    customers.dbtModelIdentity.sourceUuid = dbtSourceUuid;
                const deployed = [customers];
                await sourceDeploy(fixture, 'marketing', deployed);
                expect(deployed[0].name).toBe('marketing__customers');
                expect(deployed[0].dbtModelIdentity?.sourceUuid).toBe(
                    fixture.sourceUuids.marketing,
                );
                expect(deployed[0].tables.purchased_orders).toMatchObject({
                    name: 'purchased_orders',
                    canonicalName: providerName,
                    dbtSourceUuid,
                    dbtModelUniqueId: 'model.primary.orders',
                });
                expect(deployed[0].joinedTables[0]).toMatchObject({
                    table: 'purchased_orders',
                    tablesReferences: [
                        'marketing__customers',
                        'purchased_orders',
                    ],
                });
                expect(
                    deployed[0].tables.purchased_orders.dimensions.id
                        .compiledSql,
                ).toBe('"purchased_orders".id');
                const warehouse = knex({
                    client: 'pg',
                    connection: {
                        ...postgresWarehouse(ORIGINAL_DB),
                        database: ORIGINAL_DB,
                    },
                });
                try {
                    await warehouse.raw(
                        `SELECT ${deployed[0].tables.purchased_orders.dimensions.id.compiledSql}
                         FROM ${deployed[0].tables.marketing__customers.sqlTable} AS "marketing__customers"
                         LEFT JOIN ${deployed[0].tables.purchased_orders.sqlTable} AS "purchased_orders"
                         ON ${deployed[0].joinedTables[0].compiledSqlOn}`,
                    );
                } finally {
                    await warehouse.destroy();
                }
                expect(
                    await database('cached_explore')
                        .where('cached_explore_uuid', owner.cached_explore_uuid)
                        .first(),
                ).toEqual(beforeOwner);
                const afterAllocations = await allocations(fixture);
                expect(
                    afterAllocations.filter(
                        (row) => row.model_unique_id === 'model.primary.orders',
                    ),
                ).toMatchObject([
                    { name: providerName, source_key: 'primary' },
                ]);
                if (beforeAllocation)
                    expect(
                        afterAllocations.find(
                            (row) => row.name === providerName,
                        ),
                    ).toEqual(beforeAllocation);
                expect(
                    (await cachedExplores(fixture.projectUuid)).find(
                        (row) => row.name === 'marketing__customers',
                    )?.explore,
                ).toEqual(deployed[0]);
            },
        );

        test('a source deploy rejects a joined provider stamped with a source from another project', async () => {
            const fixture = await createProject();
            const foreign = await createProject();
            await compile(fixture);
            const customers = deployedModel('marketing', 'customers');
            const { orders } = deployedModel('primary', 'orders').tables;
            customers.tables.purchased_orders = {
                ...orders,
                name: 'purchased_orders',
                originalName: 'orders',
                canonicalName: 'orders',
                dbtSourceUuid: foreign.sourceUuids.marketing,
            };
            const before = await dump(fixture.projectUuid);
            const beforeAllocations = await allocations(fixture);
            await expect(
                sourceDeploy(fixture, 'marketing', [customers]),
            ).rejects.toMatchObject({ statusCode: 409 });
            expect(await dump(fixture.projectUuid)).toEqual(before);
            expect(await allocations(fixture)).toEqual(beforeAllocations);
        });

        test.each(['refresh', 'deploy'] as const)(
            'seeds cached qualified names before the first %s without renaming either owner',
            async (operation) => {
                const fixture = await createProject();
                sourceManifests.finance = dbtManifest('finance', [
                    { name: 'orders', database: EXTRA_DB, table: 'payments' },
                ]);
                await compile(fixture);
                const { dbtSourceName } =
                    await projectModel.getDbtSourceIdentity(
                        fixture.projectUuid,
                    );
                const primaryName = `${dbtSourceName}__orders`;
                const [orders] = (
                    await cachedExplores(fixture.projectUuid)
                ).filter((row) => row.name === primaryName);
                const renamed = structuredClone(orders.explore);
                if (renamed.tables?.[primaryName])
                    renamed.tables[primaryName].originalName = 'orders';
                delete renamed.dbtModelIdentity;
                if (renamed.tables)
                    renamed.tables = Object.fromEntries(
                        Object.entries(renamed.tables).map(
                            ([
                                name,
                                {
                                    dbtModelUniqueId: _dbtModelUniqueId,
                                    dbtSourceName: _dbtSourceName,
                                    ...table
                                },
                            ]) => [name, table],
                        ),
                    );
                await database('cached_explore')
                    .where({
                        project_uuid: fixture.projectUuid,
                        name: primaryName,
                    })
                    .update({
                        name: primaryName,
                        explore: JSON.stringify(renamed),
                        table_names: Object.keys(renamed.tables ?? {}),
                    });
                await database('explore_name_allocations')
                    .where('project_uuid', fixture.projectUuid)
                    .delete();
                const before = (await cachedExplores(fixture.projectUuid)).map(
                    (row) => row.name,
                );
                expect(before).not.toContain('orders');
                if (operation === 'refresh') await compile(fixture);
                else
                    await sourceDeploy(fixture, 'finance', [
                        deployedModel('finance', 'orders'),
                    ]);
                expect(
                    (await cachedExplores(fixture.projectUuid)).map(
                        (row) => row.name,
                    ),
                ).toEqual(before);
                expect(
                    (await allocations(fixture)).map((row) => row.name),
                ).toContain(primaryName);
                expect(
                    (await allocations(fixture)).map((row) => row.name),
                ).toContain('finance__orders');
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === 'orders',
                    ),
                ).toMatchObject({
                    name: 'orders',
                    model_name: 'orders',
                    is_reserved: true,
                });
            },
        );

        test('keeps cached qualified error names with the old top-level source stamp', async () => {
            const fixture = await createProject();
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            await compile(fixture);
            await database('cached_explore')
                .where({
                    project_uuid: fixture.projectUuid,
                    name: 'finance__orders',
                })
                .update({
                    table_names: [],
                    explore: JSON.stringify({
                        name: 'finance__orders',
                        label: 'Orders',
                        dbtSourceUuid: fixture.sourceUuids.finance,
                        errors: [
                            {
                                type: 'NO_DIMENSIONS_FOUND',
                                message: 'No dimensions',
                            },
                        ],
                    }),
                });
            await database('explore_name_allocations')
                .where('project_uuid', fixture.projectUuid)
                .delete();
            await compile(fixture);
            const { dbtSourceName } = await projectModel.getDbtSourceIdentity(
                fixture.projectUuid,
            );
            expect(await bindings(fixture.projectUuid)).toMatchObject({
                [`${dbtSourceName}__orders`]: null,
                finance__orders: fixture.extraConnectionUuid,
            });
            expect(
                (await allocations(fixture)).find(
                    (row) => row.name === 'finance__orders',
                ),
            ).toMatchObject({
                model_unique_id: 'model.finance.orders',
                source_key: fixture.sourceUuids.finance,
            });
        });

        test('claims genuine bare model names before qualifying simultaneous unsaved collisions', async () => {
            const fixture = await createProject();
            await bind(fixture, 'finance', null);
            await database('project_dbt_sources')
                .where('project_dbt_source_uuid', fixture.sourceUuids.finance)
                .update({ precedence: 0 });
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: ORIGINAL_DB, table: 'orders' },
            ]);
            sourceManifests.marketing = dbtManifest('marketing', [
                { name: 'orders', database: ORIGINAL_DB, table: 'orders' },
                {
                    name: 'finance__orders',
                    database: ORIGINAL_DB,
                    table: 'orders',
                },
            ]);
            await compile(fixture, [primaryModels[1]]);
            expect(fetchedWith.map(({ source }) => source)).toEqual([
                'finance',
                'marketing',
            ]);
            const published = await cachedExplores(fixture.projectUuid);
            expect(
                published.filter(({ explore: cached }) =>
                    isExploreError(cached),
                ),
            ).toMatchObject([
                {
                    name: 'finance__orders__conflict',
                    explore: {
                        errors: [
                            {
                                type: 'EXPLORE_NAME_COLLISION',
                                message: expect.stringContaining(
                                    'model.marketing.finance__orders',
                                ),
                            },
                        ],
                    },
                },
            ]);
            expect(await bindings(fixture.projectUuid)).toEqual({
                customers: null,
                finance__orders: null,
                finance__orders__conflict: null,
                marketing__orders: null,
            });
            expect(
                (await allocations(fixture)).find(
                    ({ name }) => name === 'finance__orders',
                ),
            ).toMatchObject({
                source_key: fixture.sourceUuids.marketing,
                model_unique_id: 'model.marketing.finance__orders',
            });
            expect(
                (await allocations(fixture)).find(
                    ({ name }) => name === 'orders',
                ),
            ).toMatchObject({
                name: 'orders',
                model_name: 'orders',
                is_reserved: true,
            });
        });

        test('returns one refresh error for a double collision and rejects deploy atomically with 409', async () => {
            const fixture = await createProject();
            const primary = [
                ...primaryModels,
                {
                    name: 'finance__orders',
                    database: ORIGINAL_DB,
                    table: 'orders',
                },
            ];
            await compile(fixture, primary);
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            await compile(fixture, primary);
            const published = await cachedExplores(fixture.projectUuid);
            expect(
                published.filter((row) => 'errors' in row.explore),
            ).toMatchObject([
                {
                    name: 'finance__orders__conflict',
                    explore: {
                        errors: [
                            {
                                type: 'EXPLORE_NAME_COLLISION',
                                message: expect.stringContaining(
                                    'model.primary.finance__orders',
                                ),
                            },
                        ],
                    },
                },
            ]);
            expect(await bindings(fixture.projectUuid)).toMatchObject({
                orders: null,
                finance__orders: null,
                customers: null,
            });
            const before = await dump(fixture.projectUuid);
            const beforeAllocations = await allocations(fixture);
            await expect(
                sourceDeploy(fixture, 'finance', [
                    deployedModel('finance', 'orders'),
                ]),
            ).rejects.toMatchObject({ statusCode: 409 });
            expect(await dump(fixture.projectUuid)).toEqual(before);
            expect(await allocations(fixture)).toEqual(beforeAllocations);
        });

        test('keeps a reservation when qualified models are removed and replaced', async () => {
            const fixture = await createProject();
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            await compile(fixture);
            const reservation = (await allocations(fixture)).find(
                ({ name }) => name === 'orders',
            );
            expect(reservation).toMatchObject({
                name: 'orders',
                model_name: 'orders',
                is_reserved: true,
            });
            await compile(fixture, [primaryModels[1]]);
            expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                'orders',
            );
            expect(await bindings(fixture.projectUuid)).toHaveProperty(
                'finance__orders',
            );
            sourceManifests.marketing = dbtManifest('marketing', [
                { name: 'orders', database: ORIGINAL_DB, table: 'orders' },
            ]);
            await compile(fixture, [primaryModels[1]]);
            expect(
                (await allocations(fixture)).find(
                    (row) => row.name === 'orders',
                ),
            ).toEqual(reservation);
            expect(
                (await allocations(fixture)).find(
                    (row) => row.name === 'marketing__orders',
                ),
            ).toMatchObject({
                model_unique_id: 'model.marketing.orders',
                is_reserved: false,
            });
            expect(await bindings(fixture.projectUuid)).toHaveProperty(
                'marketing__orders',
            );
            await sourceDeploy(fixture, 'marketing', [
                deployedModel('marketing', 'campaigns'),
            ]);
            expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                'orders',
            );
            expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                'marketing__orders',
            );
            await sourceDeploy(fixture, 'finance', [
                deployedModel('finance', 'orders'),
            ]);
            expect(await bindings(fixture.projectUuid)).toHaveProperty(
                'finance__orders',
            );
            expect(
                (await allocations(fixture)).find(
                    (row) => row.name === 'orders',
                ),
            ).toEqual(reservation);
        });

        test('serializes concurrent source deploys under the publication lock', async () => {
            const fixture = await createProject();
            await compile(fixture, [primaryModels[1]]);
            await Promise.all(
                ['marketing', 'finance'].map((source) =>
                    sourceDeploy(fixture, source, [
                        deployedModel(source, 'orders'),
                    ]),
                ),
            );
            const rows = (await allocations(fixture)).filter(
                (row) => row.model_name === 'orders',
            );
            expect(rows).toHaveLength(2);
            expect(rows.filter((row) => row.name === 'orders')).toHaveLength(1);
            expect(
                rows.filter((row) => row.name.endsWith('__orders')),
            ).toHaveLength(1);
            const cached = await bindings(fixture.projectUuid);
            rows.forEach((row) => expect(cached).toHaveProperty(row.name));
        });

        test('leaves a single source unchanged without allocating names', async () => {
            const fixture = await createProject(
                postgresWarehouse(EXTRA_DB),
                { listAllDatabases: false, additionalDatabases: [] },
                false,
            );
            await compile(fixture);
            expect(await bindings(fixture.projectUuid)).toEqual({
                customers: null,
                orders: null,
            });
            expect(await allocations(fixture)).toEqual([]);
            const deployed = [deployedModel('primary', 'orders')];
            await sourceDeploy(fixture, null, deployed);
            expect(deployed[0].name).toBe('orders');
            expect(await allocations(fixture)).toEqual([]);
        });
    });

    describe('CLI deploy of one source', () => {
        const deployed = (name: string): Explore =>
            ({
                name,
                label: name,
                tags: [],
                baseTable: name,
                joinedTables: [],
                tables: {
                    [name]: {
                        name,
                        label: name,
                        database: EXTRA_DB,
                        schema: 'public',
                        sqlTable: `"public"."${name}"`,
                        dimensions: {},
                        metrics: {},
                        lineageGraph: {},
                    },
                },
                targetDatabase: 'postgres',
            }) as unknown as Explore;

        test('removes the stale explores of that source and keeps every other explore with its binding', async () => {
            const fixture = await createProject();
            await compile(fixture);
            await database('cached_explore').insert({
                project_uuid: fixture.projectUuid,
                name: 'virtual_payments',
                table_names: ['virtual_payments'],
                explore: JSON.stringify({
                    ...deployed('virtual_payments'),
                    type: ExploreType.VIRTUAL,
                }),
                warehouse_connection_uuid: fixture.extraConnectionUuid,
            } as never);

            await compiler.save(
                fixture.projectUuid,
                await compiler.prepareSourceDeploy({
                    projectUuid: fixture.projectUuid,
                    projectDbtSourceUuid: fixture.sourceUuids.finance,
                    explores: [deployed('refunds')],
                }),
            );

            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                refunds: fixture.extraConnectionUuid,
                virtual_payments: fixture.extraConnectionUuid,
            });
        });

        test('a deploy with no source binds to the original and keeps the other sources', async () => {
            const fixture = await createProject();
            await compile(fixture);

            await compiler.save(
                fixture.projectUuid,
                await compiler.prepareSourceDeploy({
                    projectUuid: fixture.projectUuid,
                    projectDbtSourceUuid: null,
                    explores: [deployed('orders')],
                }),
            );

            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
        });
    });

    describe('two extra connections and sequential deploys', () => {
        test('each extra connection compiles its sources, carries a dead connection and qualifies a later collision', async () => {
            const fixture = await createProject();
            const marketingUuid = await addExtra(
                fixture,
                'Marketing warehouse',
                postgresWarehouse(ORIGINAL_DB),
            );
            await bind(fixture, 'marketing', marketingUuid);

            await compile(fixture);
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: marketingUuid,
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
            expect(
                await database('warehouse_connection_manifests')
                    .select('warehouse_connection_uuid')
                    .whereIn('warehouse_connection_uuid', [
                        marketingUuid,
                        fixture.extraConnectionUuid,
                    ]),
            ).toHaveLength(2);

            await setCredentials(
                fixture,
                marketingUuid,
                postgresWarehouse(ORIGINAL_DB, DEAD_PORT),
            );
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'refunds', database: EXTRA_DB, table: 'refunds' },
            ]);
            fetchedWith.length = 0;
            const carried = await compile(fixture);
            expect(carried.warnings).toEqual([
                expect.stringContaining(
                    'Connection "Marketing warehouse" failed to compile',
                ),
            ]);
            expect(fetchedWith.map(({ source }) => source)).toEqual([
                'finance',
            ]);
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: marketingUuid,
                customers: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
                refunds: fixture.extraConnectionUuid,
            });

            await setCredentials(
                fixture,
                marketingUuid,
                postgresWarehouse(ORIGINAL_DB),
            );
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'campaigns', database: EXTRA_DB, table: 'campaigns' },
            ]);
            const compilation = await compile(fixture);
            expect(compilation.warnings).toEqual([
                expect.stringContaining('finance__campaigns'),
            ]);
            expect(await bindings(fixture.projectUuid)).toMatchObject({
                campaigns: marketingUuid,
                finance__campaigns: fixture.extraConnectionUuid,
            });
        });

        test('with a dead extra, an explore whose model left a healthy group is still dropped', async () => {
            const fixture = await createProject();
            await compile(fixture);
            await setCredentials(
                fixture,
                fixture.extraConnectionUuid,
                postgresWarehouse(EXTRA_DB, DEAD_PORT),
            );

            const compilation = await compile(fixture, [primaryModels[0]]);

            expect(compilation.warnings).toHaveLength(1);
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
        });

        test('a deploy of the primary after a deploy of an extra source keeps the extra source explores bound', async () => {
            const fixture = await createProject();
            await compile(fixture);

            await compiler.save(
                fixture.projectUuid,
                await compiler.prepareSourceDeploy({
                    projectUuid: fixture.projectUuid,
                    projectDbtSourceUuid: fixture.sourceUuids.finance,
                    explores: [explore('refunds', ['refunds'])],
                }),
            );
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                refunds: fixture.extraConnectionUuid,
            });

            await compiler.save(
                fixture.projectUuid,
                await compiler.prepareSourceDeploy({
                    projectUuid: fixture.projectUuid,
                    projectDbtSourceUuid: null,
                    explores: [explore('orders', ['orders'])],
                }),
            );
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                orders: null,
                refunds: fixture.extraConnectionUuid,
            });
        });
    });

    describe('dbt source bindings', () => {
        test('copying sources remaps each binding, keeps NULL, and refuses an unmapped binding', async () => {
            const upstream = await createProject();
            const target = await createProject(
                postgresWarehouse(EXTRA_DB),
                { listAllDatabases: false, additionalDatabases: [] },
                false,
            );

            await projectDbtSourcesModel.copySourcesWithConnectionMap(
                upstream.projectUuid,
                target.projectUuid,
                new Map([
                    [upstream.extraConnectionUuid, target.extraConnectionUuid],
                ]),
            );
            const copied = await projectDbtSourcesModel.getSourcesWithBindings(
                target.projectUuid,
            );
            expect(
                copied.map((source) => [
                    source.name,
                    source.warehouseConnectionUuid,
                ]),
            ).toEqual([
                ['marketing', null],
                ['finance', target.extraConnectionUuid],
            ]);

            await expect(
                projectDbtSourcesModel.copySourcesWithConnectionMap(
                    upstream.projectUuid,
                    target.projectUuid,
                    new Map(),
                ),
            ).rejects.toThrow(
                'The copy has no connection for dbt source "finance"',
            );
        });

        const bindingAnalytics = { track: vi.fn() };
        const bindingService = () =>
            new WarehouseConnectionBindingService({
                dbtSourceRefCatalogModel: { deleteForSource: vi.fn() },
                featureFlagService: {
                    get: vi.fn(async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled: false,
                    })),
                } as never,
                projectModel,
                warehouseConnectionCompileModel,
                warehouseConnectionModel,
                credentialPolicy: new ProjectService({
                    featureFlagModel: {
                        get: async () => ({ id: 'flag', enabled: false }),
                    },
                } as never),
                analytics: bindingAnalytics,
            });

        const projectAdmin = async (projectUuid: string) => {
            const { organizationUuid } =
                await projectModel.getSummary(projectUuid);
            return fromSession(
                {
                    ...defaultSessionUser,
                    organizationUuid,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: 'manage' },
                    ] as never),
                },
                'session-cookie',
            );
        };

        const financeBinding = async (projectUuid: string) =>
            (
                await projectDbtSourcesModel.getSourcesWithBindings(projectUuid)
            ).find((source) => source.name === 'finance')
                ?.warehouseConnectionUuid;

        test('the binding service binds a source, stores NULL for the original and refuses another project connection', async () => {
            const fixture = await createProject();
            const other = await createProject();
            const account = await projectAdmin(fixture.projectUuid);

            await expect(
                bindingService().bindDbtSource(
                    account,
                    fixture.projectUuid,
                    fixture.sourceUuids.finance,
                    other.extraConnectionUuid,
                ),
            ).rejects.toThrow(NotFoundError);
            expect(await financeBinding(fixture.projectUuid)).toBe(
                fixture.extraConnectionUuid,
            );

            await bindingService().bindDbtSource(
                account,
                fixture.projectUuid,
                fixture.sourceUuids.finance,
                fixture.originalConnectionUuid,
            );
            expect(await financeBinding(fixture.projectUuid)).toBeNull();
            expect(vi.mocked(bindingAnalytics.track)).toHaveBeenCalledWith({
                event: 'warehouse_connection.dbt_source_rebound',
                userId: account.user.userUuid,
                properties: {
                    organizationId: account.organization.organizationUuid,
                    projectId: fixture.projectUuid,
                    dbtSourceId: fixture.sourceUuids.finance,
                    warehouseConnectionId: fixture.originalConnectionUuid,
                    previousWarehouseConnectionId: fixture.extraConnectionUuid,
                    warehouseType: 'postgres',
                    connectionKind: 'primary',
                    credentialSource: null,
                    connectionCount: 2,
                },
            });

            await bindingService().bindDbtSource(
                account,
                fixture.projectUuid,
                fixture.sourceUuids.finance,
                fixture.extraConnectionUuid,
            );
            expect(await financeBinding(fixture.projectUuid)).toBe(
                fixture.extraConnectionUuid,
            );
        });

        test('the binding service refuses to bind the primary dbt source and says why', async () => {
            const fixture = await createProject();
            const identity = await projectModel.getDbtSourceIdentity(
                fixture.projectUuid,
            );
            const account = await projectAdmin(fixture.projectUuid);

            await expect(
                bindingService().bindDbtSource(
                    account,
                    fixture.projectUuid,
                    identity.dbtSourceUuid,
                    fixture.extraConnectionUuid,
                ),
            ).rejects.toThrow(
                new ParameterError(
                    'The primary dbt source always runs on the original connection',
                ),
            );
            expect(vi.mocked(bindingAnalytics.track)).toHaveBeenCalledWith({
                event: 'warehouse_connection.action_refused',
                userId: account.user.userUuid,
                properties: {
                    organizationId: account.organization.organizationUuid,
                    projectId: fixture.projectUuid,
                    warehouseConnectionId: fixture.extraConnectionUuid,
                    warehouseType: 'postgres',
                    connectionKind: 'extra',
                    credentialSource: null,
                    connectionCount: 2,
                    operation: 'rebind',
                    reason: 'primary_source',
                },
            });
        });

        test('the binding service refuses a dbt source of another project', async () => {
            const fixture = await createProject();
            const other = await createProject();

            await expect(
                bindingService().bindDbtSource(
                    await projectAdmin(fixture.projectUuid),
                    fixture.projectUuid,
                    other.sourceUuids.finance,
                    null,
                ),
            ).rejects.toThrow(NotFoundError);
            expect(await financeBinding(other.projectUuid)).toBe(
                other.extraConnectionUuid,
            );
        });

        test('the binding service lists the connections and the binding of each additional source', async () => {
            const fixture = await createProject();

            await expect(
                bindingService().getDbtSourceBindings(
                    await projectAdmin(fixture.projectUuid),
                    fixture.projectUuid,
                ),
            ).resolves.toEqual({
                connections: [
                    {
                        warehouseConnectionUuid: fixture.originalConnectionUuid,
                        name: 'Original',
                        isOriginal: true,
                    },
                    {
                        warehouseConnectionUuid: fixture.extraConnectionUuid,
                        name: 'Finance warehouse',
                        isOriginal: false,
                    },
                ],
                sources: [
                    {
                        projectDbtSourceUuid: fixture.sourceUuids.marketing,
                        warehouseConnectionUuid: null,
                    },
                    {
                        projectDbtSourceUuid: fixture.sourceUuids.finance,
                        warehouseConnectionUuid: fixture.extraConnectionUuid,
                    },
                ],
            });
        });

        test('the binding list is refused on a single project and without permission to manage the project', async () => {
            const fixture = await createProject();
            const { organizationUuid } = await projectModel.getSummary(
                fixture.projectUuid,
            );
            const viewer = fromSession(
                {
                    ...defaultSessionUser,
                    organizationUuid,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: 'view' },
                    ] as never),
                },
                'session-cookie',
            );

            await expect(
                bindingService().getDbtSourceBindings(
                    viewer,
                    fixture.projectUuid,
                ),
            ).rejects.toThrow(
                'You do not have permission to manage this project',
            );
            await database('projects')
                .where('project_uuid', fixture.projectUuid)
                .update({ connection_mode: 'single' } as never);
            await expect(
                bindingService().getDbtSourceBindings(
                    await projectAdmin(fixture.projectUuid),
                    fixture.projectUuid,
                ),
            ).rejects.toThrow(SingleConnectionProjectError);
        });

        test('the binding service refuses to bind a source in a single project', async () => {
            const fixture = await createProject();
            await database('projects')
                .where('project_uuid', fixture.projectUuid)
                .update({ connection_mode: 'single' } as never);

            await expect(
                bindingService().bindDbtSource(
                    await projectAdmin(fixture.projectUuid),
                    fixture.projectUuid,
                    fixture.sourceUuids.finance,
                    null,
                ),
            ).rejects.toThrow(SingleConnectionProjectError);
            expect(await financeBinding(fixture.projectUuid)).toBe(
                fixture.extraConnectionUuid,
            );
        });

        test('a source cannot be bound to another project connection', async () => {
            const first = await createProject();
            const second = await createProject();

            await expect(
                bind(first, 'finance', second.extraConnectionUuid),
            ).rejects.toThrow();
            expect(
                (
                    await projectDbtSourcesModel.getSourcesWithBindings(
                        first.projectUuid,
                    )
                ).find((source) => source.name === 'finance')
                    ?.warehouseConnectionUuid,
            ).toBe(first.extraConnectionUuid);
        });

        const dbtSourcesService = () =>
            new ProjectDbtSourcesService({
                dbtSourceRefCatalogModel: new DbtSourceRefCatalogModel({
                    database,
                }),
                lightdashConfig: lightdashConfigMock,
                analytics: { track: vi.fn() } as never,
                projectModel,
                projectDbtSourcesModel,
                githubAppInstallationsModel: new GithubAppInstallationsModel({
                    database,
                    encryptionUtil,
                }),
                featureFlagService: {
                    get: async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled: false,
                    }),
                },
            });

        const salesConnection = {
            ...githubDbtConnection('org/sales'),
            personal_access_token: `ghp_${'a'.repeat(36)}`,
        };

        test('a dbt source added to a multi project is bound to the original and compiles there', async () => {
            const fixture = await createProject();
            sourceManifests.sales = dbtManifest('sales', [
                { name: 'invoices', database: ORIGINAL_DB, table: 'invoices' },
            ]);

            const created = await dbtSourcesService().createProjectDbtSource(
                await projectAdmin(fixture.projectUuid),
                fixture.projectUuid,
                { name: 'sales', dbtConnection: salesConnection },
            );
            await compile(fixture);

            expect(
                (
                    await projectDbtSourcesModel.getSourcesWithBindings(
                        fixture.projectUuid,
                    )
                ).find(
                    (source) =>
                        source.projectDbtSourceUuid ===
                        created.projectDbtSourceUuid,
                )?.warehouseConnectionUuid,
            ).toBeNull();
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                invoices: null,
                orders: null,
                payments: fixture.extraConnectionUuid,
            });
        });

        test('updating a dbt source on a multi project keeps its binding', async () => {
            const fixture = await createProject();

            await dbtSourcesService().updateProjectDbtSource(
                await projectAdmin(fixture.projectUuid),
                fixture.projectUuid,
                fixture.sourceUuids.finance,
                { name: 'finance_renamed' },
            );

            const [renamed] = (
                await projectDbtSourcesModel.getSourcesWithBindings(
                    fixture.projectUuid,
                )
            ).filter(
                (source) =>
                    source.projectDbtSourceUuid === fixture.sourceUuids.finance,
            );
            expect(renamed).toMatchObject({
                name: 'finance_renamed',
                warehouseConnectionUuid: fixture.extraConnectionUuid,
            });
        });

        test('deleting the only source of an extra connection removes its explores and the connection is not contacted', async () => {
            const fixture = await createProject();
            await compile(fixture);
            expect((await bindings(fixture.projectUuid)).payments).toBe(
                fixture.extraConnectionUuid,
            );
            const loadCredentials = vi.spyOn(
                compileCredentials,
                'getExtraConnectionWarehouseCredentials',
            );

            await dbtSourcesService().deleteProjectDbtSource(
                await projectAdmin(fixture.projectUuid),
                fixture.projectUuid,
                fixture.sourceUuids.finance,
            );
            const compilation = await compile(fixture);

            expect(compilation.warnings).toEqual([]);
            expect(loadCredentials).not.toHaveBeenCalled();
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
            });
        });
    });
});
