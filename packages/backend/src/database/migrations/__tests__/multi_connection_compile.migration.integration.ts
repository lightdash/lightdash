import { Ability } from '@casl/ability';
import {
    calculateCompilationReport,
    convertExplores,
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    ExploreType,
    getCatalogMissingEntries,
    getModelsFromManifest,
    isExploreError,
    JobStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    ParameterError,
    RequestMethod,
    SingleConnectionProjectError,
    SupportedDbtAdapter,
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
    warehouseSqlBuilderFromType,
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
import { DbtSourceRefCatalogModel } from '../../../models/DbtSourceRefCatalogModel';
import { DeploySessionModel } from '../../../models/DeploySessionModel';
import { GithubAppInstallationsModel } from '../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { JobModel } from '../../../models/JobModel/JobModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../../models/ProjectCompileLogModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { rewriteAllocatedExplore } from '../../../models/ProjectModel/allocatedExploreReferences';
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
    ): Promise<Fixture> => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Compile test' })
            .returning(['organization_id', 'organization_uuid']);
        const [project] = await database('projects')
            .insert({
                name: 'Compile project',
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
                        fetchManifest: async () => ({
                            manifest: dbtManifest('primary', primary),
                            timings: {
                                gitRefreshMs: null,
                                depsMs: null,
                                manifestMs: 0,
                            },
                        }),
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
                    crossSourceRefsEnabled: false,
                    mixedWarehouseConnectionsEnabled: false,
                    fetchSourceManifest,
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
            primaryModels?: FixtureModel[];
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
                projectDbtSourcesModel,
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

        test('saveDeployExplores on a multi project replaces the deployed source and keeps the other sources with their bindings', async () => {
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
                cliDeploy: { sourceUuid: null, target: null },
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
                    [explore('refunds', ['refunds'])],
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

            test('setExplores on a multi project with no source binds to the original when the target matches it (D3)', async () => {
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
                        [explore('payments', ['payments'])],
                        'cli-1',
                        true,
                        undefined,
                        { sourceUuid: null, target: { database: EXTRA_DB } },
                    ),
                ).rejects.toThrow(
                    `The dbt target compiles against database ${EXTRA_DB}, but the deploy goes to the connection "Original", which points at ${ORIGINAL_DB}. Choose the dbt source for this target with --source.`,
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
                        [explore('refunds', ['refunds'])],
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
                        [explore('refunds', ['refunds'])],
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
                            explore('refunds', ['refunds']),
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
                    [explore('refunds', ['refunds'])],
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
                    [explore('payments', ['payments'])],
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
                        explore('refunds', ['refunds']),
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

            test('a deploy of the primary keeps an extra connection error explore that has no source stamp', async () => {
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
                    NO_SOURCE,
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
                            sourceUuid: null,
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
                        explore('refunds', ['refunds']),
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
                    [explore('campaigns', ['campaigns'])],
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

            test('a deploy replaces an error explore with no source stamp on its own connection', async () => {
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
                    NO_SOURCE,
                );

                expect(await bindings(fixture.projectUuid)).toEqual({
                    campaigns: null,
                    orders: null,
                    payments: fixture.extraConnectionUuid,
                });
            });

            test('a single project ignores the source and the target and writes the rows of the main deploy save', async () => {
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
                expect(compilation.warnings).toHaveLength(2);
                const publishedAllocations = await allocations(fixture);
                const publishedExplores = await cachedExplores(
                    fixture.projectUuid,
                );
                for (const source of sourceOrder) {
                    expect(compilation.warnings).toContainEqual(
                        expect.stringContaining(
                            `is assigned explore name "${source}__orders" because multiple new sources`,
                        ),
                    );
                    expect(
                        publishedAllocations.find(
                            ({ name }) => name === `${source}__orders`,
                        ),
                    ).toMatchObject({
                        source_key: fixture.sourceUuids[source],
                        model_unique_id: `model.${source}.orders`,
                        model_name: 'orders',
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
                expect(
                    (await allocations(fixture)).some(
                        ({ name }) => name === 'orders',
                    ),
                ).toBe(false);
                const before = await allocations(fixture);
                await compile(fixture, [primaryModels[1]]);
                expect(await allocations(fixture)).toEqual(before);
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );

                sourceManifests.marketing = dbtManifest('marketing', [
                    {
                        name: 'campaigns',
                        database: ORIGINAL_DB,
                        table: 'campaigns',
                    },
                ]);
                await compile(fixture, [primaryModels[1]]);
                const financeOwner = before.find(
                    ({ name }) => name === 'finance__orders',
                );
                expect(
                    (await allocations(fixture)).filter(
                        ({ model_name }) => model_name === 'orders',
                    ),
                ).toEqual([financeOwner]);
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'marketing__orders',
                );
                await database('project_dbt_sources')
                    .where(
                        'project_dbt_source_uuid',
                        fixture.sourceUuids.marketing,
                    )
                    .delete();
                await compile(fixture, [primaryModels[1]]);
                expect(
                    (await allocations(fixture)).filter(
                        ({ model_name }) => model_name === 'orders',
                    ),
                ).toEqual([financeOwner]);
                expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                    'orders',
                );
                expect(await bindings(fixture.projectUuid)).toHaveProperty(
                    'finance__orders',
                );

                await compile(fixture);
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === 'orders',
                    ),
                ).toMatchObject({
                    source_key: 'primary',
                    model_unique_id: 'model.primary.orders',
                });
                expect(
                    (await allocations(fixture)).find(
                        ({ name }) => name === 'finance__orders',
                    ),
                ).toEqual(financeOwner);
                expect(await bindings(fixture.projectUuid)).toMatchObject({
                    orders: null,
                    finance__orders: null,
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
                    (await allocations(fixture)).map((row) => row.name),
                ).not.toContain('orders');
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
                (await allocations(fixture)).some(
                    ({ name }) => name === 'orders',
                ),
            ).toBe(false);
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

        test('releases a deleted model and keeps the qualified newcomer qualified', async () => {
            const fixture = await createProject();
            sourceManifests.finance = dbtManifest('finance', [
                { name: 'orders', database: EXTRA_DB, table: 'payments' },
            ]);
            await compile(fixture);
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
            ).toMatchObject({ model_unique_id: 'model.marketing.orders' });
            await sourceDeploy(fixture, 'marketing', [
                deployedModel('marketing', 'campaigns'),
            ]);
            expect(await bindings(fixture.projectUuid)).not.toHaveProperty(
                'orders',
            );
            await sourceDeploy(fixture, 'finance', [
                deployedModel('finance', 'orders'),
            ]);
            expect(await bindings(fixture.projectUuid)).toHaveProperty(
                'finance__orders',
            );
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
