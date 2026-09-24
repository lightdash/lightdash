import { Ability } from '@casl/ability';
import {
    calculateCompilationReport,
    DimensionType,
    ExploreType,
    JobStatusType,
    JobStepType,
    JobType,
    NotFoundError,
    ParameterError,
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
import { DeploySessionModel } from '../../../models/DeploySessionModel';
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
import { DeployService } from '../../../services/DeployService';
import {
    MultiConnectionCompiler,
    withConnectionWarnings,
} from '../../../services/MultiConnectionCompiler/MultiConnectionCompiler';
import { ProjectDbtSourcesService } from '../../../services/ProjectDbtSourcesService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
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
        return { manifest: sourceManifests[source.name] };
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
        const compilation = await compiler.compile({
            projectUuid: fixture.projectUuid,
            primary: {
                manifest: dbtManifest('primary', primary),
                dbtProjectDir: undefined,
                warehouseCredentials: originalCredentials,
                cachedWarehouse: {
                    warehouseCatalog: await projectModel.getWarehouseFromCache(
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
            fetchSourceManifest,
            loadExtraCredentials: loadExtraCredentials(fixture.projectUuid),
        });
        await compiler.save(fixture.projectUuid, compilation);
        return compilation;
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
            projectModel,
            projectDbtSourcesModel,
            warehouseConnectionCompileModel,
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

    describe('entry points', () => {
        type PrimaryBuild = {
            adapter: DbtManifestProjectAdapter;
            sshTunnel: { disconnect: () => Promise<void> };
            warehouseCredentials: CreateWarehouseCredentials;
            cachedWarehouse: {
                warehouseCatalog: unknown;
                onWarehouseCatalogChange: (catalog: never) => Promise<void>;
            };
            dbtVersionOption: SupportedDbtVersions;
        };
        type CompileInternals = {
            buildAdapter: (projectUuid: string) => Promise<PrimaryBuild>;
            testProjectAdapter: () => Promise<PrimaryBuild>;
            buildSourceAdapter: (
                dbtConnection: DbtProjectConfig,
                warehouseLocation: unknown,
                organizationUuid: string | undefined,
                shared: { warehouseCredentials: CreateWarehouseCredentials },
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
                    warehouseClient:
                        warehouseClientFromCredentials(warehouseCredentials),
                    cachedWarehouse: cachedWarehouse as never,
                    dbtVersion: SupportedDbtVersions.V1_8,
                    dbtProjectDir,
                }),
                sshTunnel: { disconnect: async () => {} },
                warehouseCredentials,
                cachedWarehouse,
                dbtVersionOption: SupportedDbtVersions.V1_8,
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
            vi.spyOn(internals, 'buildAdapter').mockImplementation(() =>
                primaryBuild(projectUuid, options.dbtProjectDir),
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
                        getDbtManifest: async () => ({
                            manifest: sourceManifests[name],
                        }),
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
                const deployed = await createProject();
                const baseline = await createProject();
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
                const multiTags = setTag.mock.calls.filter(([key]) =>
                    key.startsWith('warehouse.'),
                );
                setTag.mockClear();
                await run(single.projectUuid);
                const singleTags = setTag.mock.calls.filter(([key]) =>
                    key.startsWith('warehouse.'),
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

            test('a single project ignores the source and the target and writes the rows of the main deploy save', async () => {
                const deployed = await createProject();
                const baseline = await createProject();
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

        const bindingService = () =>
            new WarehouseConnectionBindingService({
                projectModel,
                warehouseConnectionCompileModel,
                credentialPolicy: new ProjectService({} as never),
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

            await expect(
                bindingService().bindDbtSource(
                    await projectAdmin(fixture.projectUuid),
                    fixture.projectUuid,
                    identity.dbtSourceUuid,
                    fixture.extraConnectionUuid,
                ),
            ).rejects.toThrow(
                new ParameterError(
                    'The primary dbt source always runs on the original connection',
                ),
            );
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
                lightdashConfig: lightdashConfigMock,
                analytics: { track: vi.fn() } as never,
                projectModel,
                projectDbtSourcesModel,
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
