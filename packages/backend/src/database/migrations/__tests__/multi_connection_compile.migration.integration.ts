import { Ability } from '@casl/ability';
import {
    calculateCompilationReport,
    ConflictError,
    DbtError,
    DeploySessionStatus,
    DimensionType,
    ExploreType,
    getCatalogMissingEntries,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    ParameterError,
    ProjectType,
    RequestMethod,
    SingleConnectionProjectError,
    SupportedDbtVersions,
    type CreateWarehouseCredentials,
    type DbtManifest,
    type DbtProjectConfig,
    type Explore,
    type ExploreError,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import {
    ListedDatabasesPostgresWarehouseClient,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
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
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
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
            dbtProjectDir: string | undefined;
        };
        const defaultCompileServiceOptions: CompileServiceOptions = {
            multiDbtSources: true,
            dbtProjectDir: undefined,
        };

        const primaryBuild = async (
            projectUuid: string,
            dbtProjectDir: string | undefined,
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
                    parsedManifest: dbtManifest('primary', primaryModels),
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
                    get: async () => ({
                        id: 'flag',
                        enabled: options.multiDbtSources,
                    }),
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
                projectParametersModel: {
                    replace: async () => {},
                    find: async () => [],
                },
            } as never);
            const internals = service as unknown as CompileInternals;
            vi.spyOn(internals, 'withCompileAdapter').mockImplementation(
                async (_projectUuid, _user, fn) => {
                    const primary = await primaryBuild(
                        projectUuid,
                        options.dbtProjectDir,
                    );
                    try {
                        return await fn(primary);
                    } finally {
                        await primary.adapter.destroy();
                    }
                },
            );
            vi.spyOn(internals, 'testProjectAdapter').mockImplementation(() =>
                primaryBuild(projectUuid, options.dbtProjectDir),
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
                        prepareDbtSource: async () => ({
                            projectDir: null,
                            timings: { gitRefreshMs: null, depsMs: null },
                        }),
                        getDbtManifest: async () => ({
                            manifest: sourceManifests[name],
                            timings: {
                                gitRefreshMs: null,
                                depsMs: null,
                                manifestMs: 0,
                            },
                        }),
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

        const runCompileProject = async (projectUuid: string) => {
            const { service, internals } = compileService(projectUuid);
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
            '%s on a single project runs the main path and never the multi compiler',
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
                expect(multiSave).not.toHaveBeenCalled();
                expect(mainSave).toHaveBeenCalledTimes(1);
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
                    undefined,
                    undefined,
                    false,
                );
                const baseline = await createProject(
                    undefined,
                    undefined,
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
                'rejects cross-source name collisions without side effects ($route, explicit $explicit)',
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
                    await expect(
                        deploy({
                            explores: [
                                packagedExplore('payments', 'finance'),
                                packagedExplore('orders', 'dbt_utils'),
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
                            'the upload would replace explores owned by another source: orders (source Core models)',
                        ),
                    });
                    expect(await guardedState(fixture.projectUuid)).toEqual(
                        before,
                    );
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
                    const save =
                        projectModel.saveMultiConnectionExplores.bind(
                            projectModel,
                        );
                    const changed =
                        change === 'unstamped'
                            ? packagedExplore('new_upstream', 'marketing')
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
                            message: expectedRejection(
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
                'name-collision',
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
                if (kind === 'name-collision')
                    explores.push(packagedExplore('payments', 'dbt_utils'));
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
                    'name-collision':
                        'the upload would replace explores owned by another source: payments (source finance)',
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

            const assertInstalledPackageCarry = async (
                sourceSelection:
                    | 'default'
                    | 'explicit'
                    | 'legacy without stamps'
                    | 'legacy with foreign stamps',
            ) => {
                const fixture = await createProject();
                await bind(fixture, 'finance', null);
                await routeSingle(fixture.projectUuid);
                await database('warehouse_connections')
                    .where(
                        'warehouse_connection_uuid',
                        fixture.extraConnectionUuid,
                    )
                    .delete();
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
                    for (const table of Object.values(legacy.tables)) {
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
                const before = await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .whereIn('name', names)
                    .orderBy('name');
                expect(before).toHaveLength(3);
                const refresh = async (label: string) => {
                    const result = await compile(
                        fixture,
                        primaryModels.map((model) => ({ ...model, label })),
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
                            .where('project_uuid', fixture.projectUuid)
                            .whereIn('name', names)
                            .orderBy('name'),
                    ).toEqual(before);
                    expect(result.warnings).toContainEqual(
                        expect.stringContaining('kept its 3 explores'),
                    );
                    expect(
                        (await cachedExplores(fixture.projectUuid)).find(
                            (row) => row.name === 'orders',
                        )?.explore.label,
                    ).toBe(label);
                };
                await refresh('First refresh');
                await refresh('Second refresh');
            };

            test.each([
                'default',
                'explicit',
                'legacy without stamps',
                'legacy with foreign stamps',
            ] as const)(
                'a %s deploy keeps installed-package explores across repeated failures',
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
                    undefined,
                    undefined,
                    false,
                );
                const baseline = await createProject(
                    undefined,
                    undefined,
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
                    primaryModels,
                    postgresWarehouse(ORIGINAL_DB),
                    true,
                    {
                        sources: ['marketing', 'finance'],
                        phase: 'manifest',
                        crossSourceRefs: false,
                    },
                );
                expect(await cachedExplores(fixture.projectUuid)).toEqual(
                    before,
                );
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

        test('a fresh explore replaces a carried-forward explore of the same name', async () => {
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

            expect(compilation.warnings).toHaveLength(1);
            expect(await bindings(fixture.projectUuid)).toEqual({
                campaigns: null,
                customers: null,
                orders: null,
                payments: null,
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

        test('two fresh groups that produce the same explore name are refused and nothing is saved', async () => {
            const fixture = await createProject();
            await compile(fixture);
            const before = await cachedExplores(fixture.projectUuid);
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'payments', database: EXTRA_DB, table: 'payments' },
                { name: 'campaigns', database: EXTRA_DB, table: 'campaigns' },
            ]);

            const error = await compile(fixture).catch((e: Error) => e);

            expect(error).toBeInstanceOf(ParameterError);
            expect((error as Error).message).toBe(
                'Explore "campaigns" is produced by both connection "Finance warehouse" and connection "Original". Explore names must be unique across connections.',
            );
            expect(await cachedExplores(fixture.projectUuid)).toEqual(before);
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
        test('each extra connection compiles its own sources, a dead one is carried by name, and a name produced by two healthy extras is refused with both names', async () => {
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
            const before = await dump(fixture.projectUuid);
            const refusal = await compile(fixture).then(
                () => null,
                (error: Error) => error,
            );
            expect(refusal?.message).toContain('Explore "campaigns"');
            expect(refusal?.message).toContain('Finance warehouse');
            expect(refusal?.message).toContain('Marketing warehouse');
            expect(await dump(fixture.projectUuid)).toEqual(before);
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
