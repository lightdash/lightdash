import { Ability } from '@casl/ability';
import {
    ChartKind,
    DbtProjectType,
    JobStatusType,
    JobType,
    NotFoundError,
    ParameterError,
    ProjectType,
    QueryExecutionContext,
    RequestMethod,
    type AllVizChartConfig,
    type CreateWarehouseCredentials,
    type ExecuteAsyncQueryRequestParams,
    type Explore,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { JobModel } from '../../../models/JobModel/JobModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import { SavedSqlModel } from '../../../models/SavedSqlModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionCompileModel } from '../../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { WarehouseConnectionIdentityModel } from '../../../models/WarehouseConnectionIdentityModel/WarehouseConnectionIdentityModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type ConnectionBinding } from '../../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { SavedSqlService } from '../../../services/SavedSqlService/SavedSqlService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';
import {
    githubDbtConnection,
    postgresWarehouse,
} from './multiConnectionCompileFixtures';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

const SECRET = 'multi-connection-runtime-test-secret';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const ORIGINAL_DB = `pr8_original_${suffix}`;
const EXTRA_DB = `pr8_extra_${suffix}`;

const tableConfig = {
    type: ChartKind.TABLE,
    metadata: { version: 1 },
    columns: {},
} as unknown as AllVizChartConfig;

const renamedMessage = (name: string) =>
    `The preview has no copy of connection '${name}'. Connections are matched by name, so renaming a connection on the upstream project or on the preview breaks this mapping.`;

type Fixture = {
    organizationId: number;
    organizationUuid: string;
    projectId: number;
    projectUuid: string;
    userUuid: string;
    spaceUuid: string;
    originalConnectionUuid: string;
    extraConnectionUuid: string;
    sourceUuids: Record<string, string>;
};

type CredentialsResult = CreateWarehouseCredentials & {
    userWarehouseCredentialsUuid: string | undefined;
};

type RuntimeInternals = {
    getWarehouseCredentials: (args: {
        projectUuid: string;
        userId: string;
        isRegisteredUser: boolean;
        binding: ConnectionBinding;
    }) => Promise<CredentialsResult>;
    refreshCredentials: (
        args: CreateWarehouseCredentials,
        userUuid: string,
    ) => Promise<CreateWarehouseCredentials>;
    getUserAttributes: () => Promise<unknown>;
    prepareSqlChartAsyncQueryArgs: (args: {
        account: ReturnType<typeof fromSession>;
        projectUuid: string;
        organizationUuid: string;
        sql: string;
        context: QueryExecutionContext;
        chartUuid?: string;
        limit?: number;
    }) => Promise<{
        warehouseConnectionUuid: string | null;
        originalColumns: Record<string, unknown>;
        warehouseConnection: { sshTunnel: { disconnect: () => Promise<void> } };
    }>;
};

describe('Multi runtime identity wiring on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let admin: Knex;
    let encryptionUtil: EncryptionUtil;
    let projectModel: ProjectModel;
    let projectDbtSourcesModel: ProjectDbtSourcesModel;
    let warehouseConnectionModel: WarehouseConnectionModel;
    let warehouseConnectionCompileModel: WarehouseConnectionCompileModel;
    let identityModel: WarehouseConnectionIdentityModel;
    let savedSqlModel: SavedSqlModel;
    let queryHistoryModel: QueryHistoryModel;
    let userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    let organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;

    const encrypt = (value: unknown) =>
        encryptionUtil.encrypt(JSON.stringify(value));

    const createWarehouseDatabase = async (name: string, table: string) => {
        await admin.raw('CREATE DATABASE ??', [name]);
        const warehouse = knex({
            client: 'pg',
            connection: { ...postgresWarehouse(name), database: name },
        });
        try {
            await warehouse.raw(
                `CREATE TABLE ?? (id integer, amount numeric)`,
                [table],
            );
            await warehouse.raw(`INSERT INTO ?? VALUES (1, 10)`, [table]);
        } finally {
            await warehouse.destroy();
        }
    };

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('multi_connection_runtime');
        database = migrated.database;
        admin = knex({
            client: 'pg',
            connection: {
                ...postgresWarehouse('postgres'),
                database: process.env.PGDATABASE ?? 'postgres',
            },
        });
        await createWarehouseDatabase(ORIGINAL_DB, 'orders');
        await createWarehouseDatabase(EXTRA_DB, 'refunds');
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
        organizationWarehouseCredentialsModel =
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
        warehouseConnectionModel = new WarehouseConnectionModel({
            database,
            encryptionUtil,
            organizationWarehouseCredentialsModel,
        });
        warehouseConnectionCompileModel = new WarehouseConnectionCompileModel({
            database,
        });
        identityModel = new WarehouseConnectionIdentityModel({ database });
        savedSqlModel = new SavedSqlModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
        queryHistoryModel = new QueryHistoryModel({ database });
        userWarehouseCredentialsModel = new UserWarehouseCredentialsModel({
            database,
            encryptionUtil,
        });
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
        if (admin) {
            await Promise.all(
                [ORIGINAL_DB, EXTRA_DB].map((name) =>
                    admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                        name,
                    ]),
                ),
            );
            await admin.destroy();
        }
    });

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const sessionUser = (fixture: Fixture): SessionUser => ({
        ...defaultSessionUser,
        userUuid: fixture.userUuid,
        organizationUuid: fixture.organizationUuid,
        ability: new Ability<PossibleAbilities>([
            { subject: 'CustomSql', action: 'manage' },
            { subject: 'SavedChart', action: ['create', 'update', 'view'] },
            { subject: 'Project', action: ['create', 'update', 'view'] },
            { subject: 'Job', action: ['create', 'view'] },
            { subject: 'CompileProject', action: ['manage'] },
        ]),
    });

    const accountFor = (fixture: Fixture) =>
        fromSession(sessionUser(fixture), 'session-cookie');

    const createOrganization = async (): Promise<{
        organizationId: number;
        organizationUuid: string;
    }> => {
        const [row] = await database('organizations')
            .insert({ organization_name: 'Runtime test' })
            .returning(['organization_id', 'organization_uuid']);
        return {
            organizationId: row.organization_id,
            organizationUuid: row.organization_uuid,
        };
    };

    const createProject = async ({
        mode,
        organization,
        withExtra = true,
        dbtConnectionType = DbtProjectType.GITHUB,
        upstreamProjectUuid = null,
    }: {
        mode: 'single' | 'multi';
        organization?: { organizationId: number; organizationUuid: string };
        withExtra?: boolean;
        dbtConnectionType?: DbtProjectType.GITHUB | DbtProjectType.NONE;
        upstreamProjectUuid?: string | null;
    }): Promise<Fixture> => {
        const org = organization ?? (await createOrganization());
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'User' } as never)
            .returning('user_uuid');
        const [project] = await database('projects')
            .insert({
                name: 'Runtime project',
                organization_id: org.organizationId,
                connection_mode: mode,
                project_type:
                    upstreamProjectUuid === null
                        ? ProjectType.DEFAULT
                        : ProjectType.PREVIEW,
                copied_from_project_uuid: upstreamProjectUuid,
                dbt_connection_type: dbtConnectionType,
                dbt_connection: encrypt(
                    dbtConnectionType === DbtProjectType.NONE
                        ? { type: DbtProjectType.NONE }
                        : githubDbtConnection('org/primary'),
                ),
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: 'postgres',
            encrypted_credentials: encrypt(postgresWarehouse(ORIGINAL_DB)),
        } as never);
        const [space] = await database('spaces')
            .insert({
                name: 'Space',
                project_id: project.project_id,
                slug: `space-${randomUUID()}`,
            } as never)
            .returning('space_uuid');
        if (!withExtra) {
            return {
                ...org,
                projectId: project.project_id,
                projectUuid: project.project_uuid,
                userUuid: user.user_uuid,
                spaceUuid: space.space_uuid,
                originalConnectionUuid: '',
                extraConnectionUuid: '',
                sourceUuids: {},
            };
        }
        const [original] = await database('warehouse_connections')
            .insert({
                project_uuid: project.project_uuid,
                is_original: true,
                name: 'Original',
            })
            .returning('warehouse_connection_uuid');
        const [extra] = await database('warehouse_connections')
            .insert({
                project_uuid: project.project_uuid,
                is_original: false,
                name: 'Finance',
                warehouse_type: 'postgres',
                encrypted_credentials: encrypt(postgresWarehouse(EXTRA_DB)),
            })
            .returning('warehouse_connection_uuid');
        return {
            ...org,
            projectId: project.project_id,
            projectUuid: project.project_uuid,
            userUuid: user.user_uuid,
            spaceUuid: space.space_uuid,
            originalConnectionUuid: original.warehouse_connection_uuid,
            extraConnectionUuid: extra.warehouse_connection_uuid,
            sourceUuids: {},
        };
    };

    const serviceArgs = () => ({
        lightdashConfig: lightdashConfigMock,
        analytics: { track: vi.fn() },
        projectModel,
        projectDbtSourcesModel,
        warehouseConnectionModel,
        warehouseConnectionCompileModel,
        warehouseConnectionIdentityModel: identityModel,
        userWarehouseCredentialsModel,
        organizationWarehouseCredentialsModel,
    });

    const runtimeService = () => {
        const service = new AsyncQueryService(serviceArgs() as never);
        const internals = service as unknown as RuntimeInternals;
        vi.spyOn(internals, 'refreshCredentials').mockImplementation(
            async (args) => args,
        );
        vi.spyOn(internals, 'getUserAttributes').mockResolvedValue({
            userAttributes: {},
            intrinsicUserAttributes: {},
        });
        return internals;
    };

    const createSqlChart = async (
        fixture: Fixture,
        sql: string,
        warehouseConnectionUuid: string | null,
    ) =>
        savedSqlModel.create(
            fixture.userUuid,
            fixture.projectUuid,
            {
                name: `Chart ${randomUUID()}`,
                description: null,
                sql,
                limit: 10,
                config: tableConfig,
                spaceUuid: fixture.spaceUuid,
            },
            { kind: 'connection', warehouseConnectionUuid },
        );

    const createQuery = async (
        fixture: Fixture,
        warehouseConnectionUuid: string | null,
    ) =>
        (
            await queryHistoryModel.create(
                accountFor(fixture),
                {
                    organizationUuid: fixture.organizationUuid,
                    projectUuid: fixture.projectUuid,
                    context: QueryExecutionContext.SQL_RUNNER,
                    compiledSql: 'select 1',
                    metricQuery: {
                        exploreName: '',
                        dimensions: [],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 10,
                        tableCalculations: [],
                    },
                    fields: {},
                    requestParameters: {} as ExecuteAsyncQueryRequestParams,
                    usedParameters: null,
                    cacheKey: randomUUID(),
                    pivotConfiguration: null,
                    originalColumns: null,
                },
                warehouseConnectionUuid === null
                    ? undefined
                    : { warehouseConnectionUuid },
            )
        ).queryUuid;

    const readCredentials = (fixture: Fixture, binding: ConnectionBinding) =>
        runtimeService().getWarehouseCredentials({
            projectUuid: fixture.projectUuid,
            userId: fixture.userUuid,
            isRegisteredUser: true,
            binding,
        });

    describe('the sqlChart credential read', () => {
        test('a SQL chart bound to an extra connection loads the extra connection', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const chart = await createSqlChart(
                fixture,
                'select 1',
                fixture.extraConnectionUuid,
            );

            await expect(
                readCredentials(fixture, {
                    kind: 'sqlChart',
                    savedSqlUuid: chart.savedSqlUuid,
                }),
            ).resolves.toMatchObject({ dbname: EXTRA_DB });
        });

        test('a SQL chart bound to NULL loads the original', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const chart = await createSqlChart(fixture, 'select 1', null);

            await expect(
                readCredentials(fixture, {
                    kind: 'sqlChart',
                    savedSqlUuid: chart.savedSqlUuid,
                }),
            ).resolves.toMatchObject({ dbname: ORIGINAL_DB });
        });

        test('a SQL chart of another project is not found and never loads the original', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'multi' });
            const chart = await createSqlChart(other, 'select 1', null);
            const loadOriginal = vi.spyOn(
                projectModel,
                'getWarehouseCredentialsForProject',
            );

            await expect(
                readCredentials(fixture, {
                    kind: 'sqlChart',
                    savedSqlUuid: chart.savedSqlUuid,
                }),
            ).rejects.toThrow(new NotFoundError('Saved sql not found'));
            expect(loadOriginal).not.toHaveBeenCalled();
        });

        test('a binding planted across projects is refused on read (K11)', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'multi' });
            const chart = await createSqlChart(fixture, 'select 1', null);
            await database('saved_sql_versions')
                .where('saved_sql_uuid', chart.savedSqlUuid)
                .update({
                    warehouse_connection_uuid: other.extraConnectionUuid,
                } as never);
            const loadOriginal = vi.spyOn(
                projectModel,
                'getWarehouseCredentialsForProject',
            );

            await expect(
                readCredentials(fixture, {
                    kind: 'sqlChart',
                    savedSqlUuid: chart.savedSqlUuid,
                }),
            ).rejects.toThrow(new NotFoundError('Connection not found'));
            expect(loadOriginal).not.toHaveBeenCalled();
        });
    });

    describe('running an extra-bound SQL chart', () => {
        test.each([
            {
                name: 'an extra-bound SQL chart runs on the extra warehouse',
                table: 'refunds',
                binding: (fixture: Fixture) => fixture.extraConnectionUuid,
                expected: (fixture: Fixture) => fixture.extraConnectionUuid,
            },
            {
                name: 'a NULL-bound SQL chart runs on the original warehouse',
                table: 'orders',
                binding: () => null,
                expected: () => null,
            },
        ])('$name', async ({ table, binding, expected }) => {
            const fixture = await createProject({ mode: 'multi' });
            const chart = await createSqlChart(
                fixture,
                `select * from ${table}`,
                binding(fixture),
            );

            const prepared =
                await runtimeService().prepareSqlChartAsyncQueryArgs({
                    account: accountFor(fixture),
                    projectUuid: fixture.projectUuid,
                    organizationUuid: fixture.organizationUuid,
                    sql: `select * from ${table}`,
                    context: QueryExecutionContext.SQL_CHART,
                    chartUuid: chart.savedSqlUuid,
                    limit: 10,
                });
            await prepared.warehouseConnection.sshTunnel.disconnect();

            expect(prepared.warehouseConnectionUuid).toBe(expected(fixture));
            expect(Object.keys(prepared.originalColumns)).toEqual([
                'id',
                'amount',
            ]);
        });

        test('the table of the extra warehouse is missing from the original, so the binding decides the warehouse', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const chart = await createSqlChart(
                fixture,
                'select * from refunds',
                null,
            );

            await expect(
                runtimeService().prepareSqlChartAsyncQueryArgs({
                    account: accountFor(fixture),
                    projectUuid: fixture.projectUuid,
                    organizationUuid: fixture.organizationUuid,
                    sql: 'select * from refunds',
                    context: QueryExecutionContext.SQL_CHART,
                    chartUuid: chart.savedSqlUuid,
                    limit: 10,
                }),
            ).rejects.toThrow('relation "refunds" does not exist');
        });
    });

    describe('the recorded query binding', () => {
        test('a query recorded on an extra connection reruns on the extra connection', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const queryUuid = await createQuery(
                fixture,
                fixture.extraConnectionUuid,
            );

            await expect(
                readCredentials(fixture, { kind: 'query', queryUuid }),
            ).resolves.toMatchObject({ dbname: EXTRA_DB });
        });

        test('a query started before an extra connection was added resolves to the original', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const queryUuid = await createQuery(fixture, null);

            await expect(
                readCredentials(fixture, { kind: 'query', queryUuid }),
            ).resolves.toMatchObject({ dbname: ORIGINAL_DB });
        });

        test('a query on a removed connection fails with the removed name and never loads the original (K10)', async () => {
            const fixture = await createProject({ mode: 'multi' });
            await database('warehouse_connections').insert({
                project_uuid: fixture.projectUuid,
                is_original: false,
                name: 'Keeps the project multi',
                warehouse_type: 'postgres',
                encrypted_credentials: encrypt(postgresWarehouse(EXTRA_DB)),
            });
            const queryUuid = await createQuery(
                fixture,
                fixture.extraConnectionUuid,
            );
            await database('warehouse_connections')
                .where('warehouse_connection_uuid', fixture.extraConnectionUuid)
                .delete();
            await database('project_connection_mode_events').insert({
                project_uuid: fixture.projectUuid,
                actor_user_uuid: fixture.userUuid,
                event: 'connection_removed',
                plan: JSON.stringify({
                    warehouseConnectionUuid: fixture.extraConnectionUuid,
                    name: 'Finance',
                    warehouseType: 'postgres',
                }),
            });
            const loadOriginal = vi.spyOn(
                projectModel,
                'getWarehouseCredentialsForProject',
            );

            await expect(
                readCredentials(fixture, { kind: 'query', queryUuid }),
            ).rejects.toThrow(
                new NotFoundError("Connection 'Finance' was removed"),
            );
            expect(loadOriginal).not.toHaveBeenCalled();
        });

        test('a query of another project is not found', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'multi' });
            const queryUuid = await createQuery(other, null);

            await expect(
                readCredentials(fixture, { kind: 'query', queryUuid }),
            ).rejects.toBeInstanceOf(NotFoundError);
        });

        test('a project that routes single loads the original without reading the query', async () => {
            const fixture = await createProject({ mode: 'single' });
            const readQuery = vi.spyOn(
                identityModel,
                'getQueryWarehouseConnectionUuid',
            );

            await expect(
                readCredentials(fixture, {
                    kind: 'query',
                    queryUuid: randomUUID(),
                }),
            ).resolves.toMatchObject({ dbname: ORIGINAL_DB });
            expect(readQuery).not.toHaveBeenCalled();
        });
    });

    describe('SQL chart saves (G10, G11)', () => {
        const savedSqlService = () => {
            const service = new SavedSqlService({
                lightdashConfig: lightdashConfigMock,
                analytics: { track: vi.fn() },
                projectModel,
                savedSqlModel,
                warehouseConnectionIdentityModel:
                    new WarehouseConnectionIdentityModel({ database }),
            } as never);
            vi.spyOn(
                service as unknown as { hasAccess: () => Promise<void> },
                'hasAccess',
            ).mockResolvedValue(undefined);
            return service;
        };

        const latestBinding = async (savedSqlUuid: string) =>
            (
                await database('saved_sql_versions')
                    .where('saved_sql_uuid', savedSqlUuid)
                    .orderBy([
                        { column: 'created_at', order: 'desc' },
                        { column: 'saved_sql_version_uuid', order: 'desc' },
                    ])
                    .first('warehouse_connection_uuid')
            ).warehouse_connection_uuid as string | null;

        const create = (
            fixture: Fixture,
            warehouseConnectionUuid?: string | null,
        ) =>
            savedSqlService().createSqlChart(
                sessionUser(fixture),
                fixture.projectUuid,
                {
                    name: `Chart ${randomUUID()}`,
                    description: null,
                    sql: 'select 1',
                    limit: 10,
                    config: tableConfig,
                    spaceUuid: fixture.spaceUuid,
                    ...(warehouseConnectionUuid === undefined
                        ? {}
                        : { warehouseConnectionUuid }),
                },
            );

        const update = (
            fixture: Fixture,
            savedSqlUuid: string,
            warehouseConnectionUuid?: string | null,
        ) =>
            savedSqlService().updateSqlChart(
                sessionUser(fixture),
                fixture.projectUuid,
                savedSqlUuid,
                {
                    versionedData: {
                        sql: 'select 2',
                        limit: 10,
                        config: tableConfig,
                        ...(warehouseConnectionUuid === undefined
                            ? {}
                            : { warehouseConnectionUuid }),
                    },
                },
            );

        test.each([
            {
                name: 'an extra connection writes its uuid',
                field: (fixture: Fixture) => fixture.extraConnectionUuid,
                expected: (fixture: Fixture) => fixture.extraConnectionUuid,
            },
            {
                name: "the original's own uuid writes NULL",
                field: (fixture: Fixture) => fixture.originalConnectionUuid,
                expected: () => null,
            },
            {
                name: 'NULL writes NULL',
                field: () => null,
                expected: () => null,
            },
            {
                name: 'no connection field writes NULL',
                field: () => undefined,
                expected: () => null,
            },
        ])('a multi create: $name', async ({ field, expected }) => {
            const fixture = await createProject({ mode: 'multi' });

            const created = await create(fixture, field(fixture));

            expect(await latestBinding(created.savedSqlUuid)).toBe(
                expected(fixture),
            );
        });

        test.each([
            {
                name: "another project's connection",
                field: (other: Fixture) => other.extraConnectionUuid,
            },
            { name: 'an unknown connection', field: () => randomUUID() },
            { name: 'a value that is not a uuid', field: () => 'finance' },
        ])(
            'a multi create naming $name is refused and writes nothing',
            async ({ field }) => {
                const fixture = await createProject({ mode: 'multi' });
                const other = await createProject({ mode: 'multi' });

                await expect(create(fixture, field(other))).rejects.toThrow(
                    new NotFoundError('Connection not found'),
                );
                expect(
                    await database('saved_sql').where(
                        'project_uuid',
                        fixture.projectUuid,
                    ),
                ).toEqual([]);
            },
        );

        test('a multi update with a connection field writes it on the new version', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await create(fixture, null);

            await update(
                fixture,
                created.savedSqlUuid,
                fixture.extraConnectionUuid,
            );

            expect(await latestBinding(created.savedSqlUuid)).toBe(
                fixture.extraConnectionUuid,
            );
        });

        test.each([
            {
                name: 'a chart on an extra connection stays on it',
                start: (fixture: Fixture) => fixture.extraConnectionUuid,
            },
            { name: 'a chart on the original stays NULL', start: () => null },
        ])(
            'an old-client multi update with no connection field: $name',
            async ({ start }) => {
                const fixture = await createProject({ mode: 'multi' });
                const created = await create(fixture, start(fixture));

                await update(fixture, created.savedSqlUuid);

                expect(
                    await database('saved_sql_versions')
                        .where('saved_sql_uuid', created.savedSqlUuid)
                        .select('saved_sql_version_uuid'),
                ).toHaveLength(2);
                expect(await latestBinding(created.savedSqlUuid)).toBe(
                    start(fixture),
                );
            },
        );

        test.each([
            {
                name: 'create',
                save: (fixture: Fixture, other: Fixture) =>
                    create(fixture, other.extraConnectionUuid),
            },
            {
                name: 'update',
                save: async (fixture: Fixture, other: Fixture) => {
                    const created = await savedSqlModel.create(
                        fixture.userUuid,
                        fixture.projectUuid,
                        {
                            name: 'Chart',
                            description: null,
                            sql: 'select 1',
                            limit: 10,
                            config: tableConfig,
                            spaceUuid: fixture.spaceUuid,
                        },
                    );
                    return update(
                        fixture,
                        created.savedSqlUuid,
                        other.extraConnectionUuid,
                    );
                },
            },
        ])(
            'a single $name that names a connection is refused',
            async ({ save }) => {
                const fixture = await createProject({
                    mode: 'single',
                    withExtra: false,
                });
                const other = await createProject({ mode: 'multi' });

                await expect(save(fixture, other)).rejects.toThrow(
                    new ParameterError(
                        'A SQL chart can name a connection only in a project with multiple connections',
                    ),
                );
            },
        );

        test('a single create with no connection field is main: the version is NULL', async () => {
            const fixture = await createProject({
                mode: 'single',
                withExtra: false,
            });

            const created = await create(fixture);

            expect(await latestBinding(created.savedSqlUuid)).toBeNull();
        });
    });

    const explore = (name: string): Explore =>
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
                    database: 'db',
                    schema: 'public',
                    sqlTable: `"db"."public"."${name}"`,
                    dimensions: {},
                    metrics: {},
                    lineageGraph: {},
                },
            },
            targetDatabase: 'postgres',
        }) as unknown as Explore;

    const cacheExplore = (
        projectUuid: string,
        name: string,
        warehouseConnectionUuid: string | null,
    ) =>
        database('cached_explore').insert({
            project_uuid: projectUuid,
            name,
            table_names: [name],
            explore: JSON.stringify(explore(name)),
            warehouse_connection_uuid: warehouseConnectionUuid,
        } as never);

    const exploreBindings = async (projectUuid: string) =>
        Object.fromEntries(
            (
                await database('cached_explore')
                    .select('name', 'warehouse_connection_uuid')
                    .where('project_uuid', projectUuid)
                    .orderBy('name')
            ).map((row) => [row.name, row.warehouse_connection_uuid]),
        );

    const connectionsByName = async (projectUuid: string) =>
        Object.fromEntries(
            (
                await database('warehouse_connections')
                    .select('name', 'warehouse_connection_uuid')
                    .where('project_uuid', projectUuid)
            ).map((row) => [row.name, row.warehouse_connection_uuid]),
        );

    const addSources = async (fixture: Fixture) => {
        const marketing = await projectDbtSourcesModel.createSource(
            fixture.projectUuid,
            {
                name: 'marketing',
                isPrimary: false,
                precedence: 1,
                dbtConnection: githubDbtConnection('org/marketing'),
                warehouseLocation: { database: null, schema: null },
            },
        );
        const finance = await projectDbtSourcesModel.createSource(
            fixture.projectUuid,
            {
                name: 'finance',
                isPrimary: false,
                precedence: 2,
                dbtConnection: githubDbtConnection('org/finance'),
                warehouseLocation: { database: null, schema: null },
            },
        );
        await warehouseConnectionCompileModel.bindDbtSource(
            fixture.projectUuid,
            finance.projectDbtSourceUuid,
            fixture.extraConnectionUuid,
        );
        return {
            marketing: marketing.projectDbtSourceUuid,
            finance: finance.projectDbtSourceUuid,
        };
    };

    const sourceBindings = async (projectUuid: string) =>
        Object.fromEntries(
            (
                await database('project_dbt_sources')
                    .select('name', 'warehouse_connection_uuid')
                    .where('project_uuid', projectUuid)
            ).map((row) => [row.name, row.warehouse_connection_uuid]),
        );

    type PreviewInternals = {
        validateProjectCreationPermissions: () => Promise<void>;
        getOnboardingFlow: () => Promise<undefined>;
        runPostProjectCreationProvisioning: () => Promise<void>;
        copyUserAccessOnPreview: () => Promise<void>;
        copyContentOnPreview: (
            upstreamProjectUuid: string,
            previewProjectUuid: string,
            user: SessionUser,
        ) => Promise<void>;
        refreshTablesAndProjectConfig: <T>(
            user: Pick<SessionUser, 'userUuid'>,
            projectUuid: string,
            requestMethod: RequestMethod,
            jobUuid: string | undefined,
            consume: (prepared: {
                exploreStream: AsyncIterable<Explore>;
                multiConnection: unknown;
            }) => Promise<T>,
        ) => Promise<T>;
        multiConnectionCompiler: {
            save: (projectUuid: string, save: never) => Promise<unknown>;
        };
    };

    const previewService = () => {
        const service = new ProjectService({
            ...serviceArgs(),
            projectParametersModel: { find: async () => [] },
            spaceModel: {
                find: async ({ projectUuid }: { projectUuid: string }) =>
                    database('spaces')
                        .innerJoin(
                            'projects',
                            'projects.project_id',
                            'spaces.project_id',
                        )
                        .where('projects.project_uuid', projectUuid)
                        .select('spaces.space_uuid as uuid'),
            },
        } as never);
        const internals = service as unknown as PreviewInternals;
        vi.spyOn(
            internals,
            'validateProjectCreationPermissions',
        ).mockResolvedValue(undefined);
        vi.spyOn(internals, 'getOnboardingFlow').mockResolvedValue(undefined);
        vi.spyOn(
            internals,
            'runPostProjectCreationProvisioning',
        ).mockResolvedValue(undefined);
        vi.spyOn(internals, 'copyUserAccessOnPreview').mockResolvedValue(
            undefined,
        );
        return { service, internals };
    };

    const createPreview = async (
        upstream: Fixture,
        dbtConnection: 'github' | 'none',
    ) => {
        const { service, internals } = previewService();
        vi.spyOn(internals, 'copyContentOnPreview').mockResolvedValue(
            undefined,
        );
        const created = await service.createWithoutCompile(
            sessionUser(upstream),
            {
                name: 'Preview',
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: upstream.projectUuid,
                copyContent: false,
                dbtVersion: 'v1.8' as never,
                ...(dbtConnection === 'none'
                    ? {
                          dbtConnection: { type: DbtProjectType.NONE },
                          warehouseConnection: postgresWarehouse(ORIGINAL_DB),
                      }
                    : {
                          dbtConnection: githubDbtConnection('org/primary'),
                          copyWarehouseConnectionFromUpstreamProject: true,
                      }),
            } as never,
            RequestMethod.WEB_APP,
        );
        return created.project.projectUuid;
    };

    describe('preview connections copy (G1 with PR 7 source copy)', () => {
        test.each([
            {
                name: 'a dbt-connected preview',
                dbtConnection: 'github' as const,
            },
            {
                name: 'a CLI preview (NONE, credentials from the CLI)',
                dbtConnection: 'none' as const,
            },
        ])(
            '$name of a multi upstream copies every connection and remaps each source binding',
            async ({ dbtConnection }) => {
                const upstream = await createProject({ mode: 'multi' });
                await addSources(upstream);

                const previewUuid = await createPreview(
                    upstream,
                    dbtConnection,
                );

                const previewConnections = await connectionsByName(previewUuid);
                expect(Object.keys(previewConnections).sort()).toEqual([
                    'Finance',
                    'Original',
                ]);
                expect(previewConnections.Finance).not.toBe(
                    upstream.extraConnectionUuid,
                );
                expect(await projectModel.getConnectionRoute(previewUuid)).toBe(
                    'multi',
                );
                expect(await sourceBindings(previewUuid)).toEqual({
                    marketing: null,
                    finance: previewConnections.Finance,
                });
            },
        );

        test('a preview of a single upstream copies no connection and copies sources as main does', async () => {
            const upstream = await createProject({
                mode: 'single',
                withExtra: false,
            });
            await projectDbtSourcesModel.createSource(upstream.projectUuid, {
                name: 'marketing',
                isPrimary: false,
                precedence: 1,
                dbtConnection: githubDbtConnection('org/marketing'),
                warehouseLocation: { database: null, schema: null },
            });

            const previewUuid = await createPreview(upstream, 'github');

            expect(await connectionsByName(previewUuid)).toEqual({});
            expect(await projectModel.getConnectionRoute(previewUuid)).toBe(
                'single',
            );
            expect(await sourceBindings(previewUuid)).toEqual({
                marketing: null,
            });
        });
    });

    describe('NONE preview refresh (G18, A-4)', () => {
        const refresh = (previewUuid: string, userUuid: string) => {
            const { internals } = previewService();
            return internals.refreshTablesAndProjectConfig(
                { userUuid },
                previewUuid,
                RequestMethod.WEB_APP,
                undefined,
                async ({ exploreStream, multiConnection }) => {
                    if (multiConnection) {
                        return internals.multiConnectionCompiler.save(
                            previewUuid,
                            multiConnection as never,
                        );
                    }
                    const explores: Explore[] = [];
                    for await (const item of exploreStream) explores.push(item);
                    return projectModel.saveExploresToCache(
                        previewUuid,
                        explores,
                        true,
                    );
                },
            );
        };

        test('a multi preview reuses the upstream explores with every binding remapped and NULL kept', async () => {
            const upstream = await createProject({ mode: 'multi' });
            await cacheExplore(upstream.projectUuid, 'orders', null);
            await cacheExplore(
                upstream.projectUuid,
                'refunds',
                upstream.extraConnectionUuid,
            );
            const previewUuid = await createPreview(upstream, 'none');

            await refresh(previewUuid, upstream.userUuid);

            expect(await exploreBindings(previewUuid)).toEqual({
                orders: null,
                refunds: (await connectionsByName(previewUuid)).Finance,
            });
        });

        test('a renamed preview connection refuses the refresh with the reason and keeps the preview explores', async () => {
            const upstream = await createProject({ mode: 'multi' });
            await cacheExplore(
                upstream.projectUuid,
                'refunds',
                upstream.extraConnectionUuid,
            );
            const previewUuid = await createPreview(upstream, 'none');
            await refresh(previewUuid, upstream.userUuid);
            const before = await exploreBindings(previewUuid);
            await database('warehouse_connections')
                .where('project_uuid', previewUuid)
                .where('name', 'Finance')
                .update({ name: 'Finance (renamed)' });

            await expect(
                refresh(previewUuid, upstream.userUuid),
            ).rejects.toThrow(renamedMessage('Finance'));
            expect(await exploreBindings(previewUuid)).toEqual(before);
        });

        test('a single preview of a multi upstream refuses extra-bound explores and never copies them unbound (A-4)', async () => {
            const upstream = await createProject({ mode: 'multi' });
            await cacheExplore(upstream.projectUuid, 'orders', null);
            await cacheExplore(
                upstream.projectUuid,
                'refunds',
                upstream.extraConnectionUuid,
            );
            const preview = await createProject({
                mode: 'single',
                withExtra: false,
                organization: upstream,
                dbtConnectionType: DbtProjectType.NONE,
                upstreamProjectUuid: upstream.projectUuid,
            });

            await expect(
                refresh(preview.projectUuid, upstream.userUuid),
            ).rejects.toThrow(renamedMessage('Finance'));
            expect(await exploreBindings(preview.projectUuid)).toEqual({});
        });

        test('a single preview of a multi upstream whose explores are all on the original refreshes as main does', async () => {
            const upstream = await createProject({ mode: 'multi' });
            await cacheExplore(upstream.projectUuid, 'orders', null);
            const preview = await createProject({
                mode: 'single',
                withExtra: false,
                organization: upstream,
                dbtConnectionType: DbtProjectType.NONE,
                upstreamProjectUuid: upstream.projectUuid,
            });

            await refresh(preview.projectUuid, upstream.userUuid);

            expect(await exploreBindings(preview.projectUuid)).toEqual({
                orders: null,
            });
        });
    });

    describe('project create job from an upstream (G2)', () => {
        const runCreateJob = async (upstream: Fixture) => {
            const jobModel = new JobModel({ database });
            const jobUuid = randomUUID();
            await jobModel.create(
                {
                    jobUuid,
                    jobType: JobType.CREATE_PROJECT,
                    jobStatus: JobStatusType.STARTED,
                    projectUuid: undefined,
                    userUuid: upstream.userUuid,
                    steps: [],
                },
                false,
            );
            const service = new ProjectService({
                ...serviceArgs(),
                jobModel,
                projectParametersModel: {
                    find: async () => [],
                    replace: async () => {},
                },
                tagsModel: {
                    replaceYamlTags: async () => ({
                        yamlTagsToCreateOrUpdate: [],
                    }),
                },
            } as never);
            const internals = service as unknown as {
                testProjectAdapter: () => Promise<unknown>;
                getOnboardingFlow: () => Promise<undefined>;
                runPostProjectCreationProvisioning: () => Promise<void>;
            };
            const lightdashProjectConfig = { spotlight: {}, parameters: {} };
            vi.spyOn(internals, 'testProjectAdapter').mockResolvedValue({
                adapter: {
                    compileAllExplores: async () => [explore('orders')],
                    getLightdashProjectConfig: async () =>
                        lightdashProjectConfig,
                    destroy: async () => {},
                },
                sshTunnel: { disconnect: async () => {} },
            });
            vi.spyOn(internals, 'getOnboardingFlow').mockResolvedValue(
                undefined,
            );
            vi.spyOn(
                internals,
                'runPostProjectCreationProvisioning',
            ).mockResolvedValue(undefined);
            vi.spyOn(
                service as unknown as {
                    getProjectContextFromAdapter: () => Promise<[]>;
                },
                'getProjectContextFromAdapter',
            ).mockResolvedValue([]);
            const saveExplores = vi
                .spyOn(service, 'saveExploresToCacheAndIndexCatalog')
                .mockResolvedValue(undefined as never);
            const scheduleCompile = vi
                .spyOn(service, 'scheduleCompileProject')
                .mockResolvedValue({ jobUuid: 'compile-job' });
            const { projectUuid } = await service._create(
                { ...sessionUser(upstream), email: undefined },
                {
                    name: 'Preview',
                    type: ProjectType.PREVIEW,
                    upstreamProjectUuid: upstream.projectUuid,
                    dbtVersion: 'v1.8' as never,
                    dbtConnection: githubDbtConnection('org/primary'),
                    warehouseConnection: postgresWarehouse(ORIGINAL_DB),
                } as never,
                jobUuid,
                RequestMethod.WEB_APP,
            );
            return { projectUuid, saveExplores, scheduleCompile };
        };

        test('a preview of a multi upstream copies connections and sources, and compiles through the multi compile', async () => {
            const upstream = await createProject({ mode: 'multi' });
            await addSources(upstream);

            const { projectUuid, saveExplores, scheduleCompile } =
                await runCreateJob(upstream);

            const previewConnections = await connectionsByName(projectUuid);
            expect(await projectModel.getConnectionRoute(projectUuid)).toBe(
                'multi',
            );
            expect(await sourceBindings(projectUuid)).toEqual({
                marketing: null,
                finance: previewConnections.Finance,
            });
            expect(saveExplores).not.toHaveBeenCalled();
            expect(scheduleCompile).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: upstream.userUuid }),
                projectUuid,
                RequestMethod.WEB_APP,
                true,
            );
        });

        test('a preview of a single upstream is main: no connection copy, the compiled explores are saved and no compile is scheduled', async () => {
            const upstream = await createProject({
                mode: 'single',
                withExtra: false,
            });

            const { projectUuid, saveExplores, scheduleCompile } =
                await runCreateJob(upstream);

            expect(await connectionsByName(projectUuid)).toEqual({});
            expect(await sourceBindings(projectUuid)).toEqual({});
            expect(saveExplores).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid,
                    explores: [explore('orders')],
                }),
            );
            expect(scheduleCompile).not.toHaveBeenCalled();
        });
    });

    describe('dbt Cloud webhook preview (G7)', () => {
        test('a webhook preview of a multi upstream is created multi with every connection copied', async () => {
            const upstream = await createProject({ mode: 'multi' });
            await database('projects')
                .where('project_uuid', upstream.projectUuid)
                .update({
                    dbt_connection_type: DbtProjectType.DBT_CLOUD_IDE,
                    dbt_connection: encrypt({
                        type: DbtProjectType.DBT_CLOUD_IDE,
                        api_key: 'dbt-cloud-key',
                        environment_id: 'dbt-cloud-environment',
                    }),
                    created_by_user_uuid: upstream.userUuid,
                } as never);
            const { service, internals } = previewService();
            (
                service as unknown as {
                    userModel: { findSessionUserByUUID: () => unknown };
                    schedulerClient: { generateValidation: () => unknown };
                }
            ).userModel = {
                findSessionUserByUUID: async () => sessionUser(upstream),
            };
            (
                service as unknown as {
                    schedulerClient: { generateValidation: () => unknown };
                }
            ).schedulerClient = { generateValidation: async () => {} };
            vi.spyOn(internals, 'copyContentOnPreview').mockResolvedValue(
                undefined,
            );
            const saveExplores = vi
                .spyOn(service, 'saveExploresToCacheAndIndexCatalog')
                .mockResolvedValue(undefined as never);
            vi.mocked(fetch).mockResolvedValueOnce({
                json: async () => ({
                    metadata: {
                        env: { DBT_CLOUD_PR_ID: '7', DBT_CLOUD_JOB_ID: '9' },
                    },
                    nodes: {},
                }),
            } as never);

            const previewUuid = await service.createPreviewFromDbtCloudWebhook(
                upstream.projectUuid,
                1,
                1,
                { rawBody: null, signature: null },
            );

            expect(
                Object.keys(await connectionsByName(previewUuid)).sort(),
            ).toEqual(['Finance', 'Original']);
            expect(await projectModel.getConnectionRoute(previewUuid)).toBe(
                'multi',
            );
            expect(saveExplores).toHaveBeenCalledWith(
                expect.objectContaining({ projectUuid: previewUuid }),
            );
        });
    });

    describe('training copy', () => {
        test('the explores of a multi training project copy with every binding remapped and NULL kept', async () => {
            const training = await createProject({ mode: 'multi' });
            await database('projects')
                .where('project_uuid', training.projectUuid)
                .update({
                    project_type: ProjectType.TRAINING,
                    created_by_user_uuid: training.userUuid,
                } as never);
            await cacheExplore(training.projectUuid, 'orders', null);
            await cacheExplore(
                training.projectUuid,
                'refunds',
                training.extraConnectionUuid,
            );
            const { service, internals } = previewService();
            vi.spyOn(internals, 'copyContentOnPreview').mockResolvedValue(
                undefined,
            );
            vi.spyOn(service, 'deleteTrainingPreviews').mockResolvedValue(
                undefined as never,
            );
            vi.spyOn(
                projectModel,
                'giveTrainingCopyOwnTiles',
            ).mockResolvedValue(undefined as never);
            vi.spyOn(
                projectModel,
                'copyDeepResearchForTrainingCopy',
            ).mockResolvedValue(undefined as never);
            const afterExploreCopy = new Error('stop after the explore copy');
            vi.spyOn(projectModel, 'findExploresFromCache').mockRejectedValue(
                afterExploreCopy,
            );

            await expect(
                (
                    service as unknown as {
                        makeTrainingCopy: (
                            user: SessionUser,
                            project: unknown,
                        ) => Promise<unknown>;
                    }
                ).makeTrainingCopy(
                    sessionUser(training),
                    await projectModel.get(training.projectUuid),
                ),
            ).rejects.toBe(afterExploreCopy);

            const [copy] = await database('projects')
                .where('copied_from_project_uuid', training.projectUuid)
                .select('project_uuid');
            expect(await exploreBindings(copy.project_uuid)).toEqual({
                orders: null,
                refunds: (await connectionsByName(copy.project_uuid)).Finance,
            });
        });
    });

    describe('preview content copy (G6, A-3)', () => {
        const copyContent = (upstream: Fixture, previewUuid: string) =>
            previewService().internals.copyContentOnPreview(
                upstream.projectUuid,
                previewUuid,
                sessionUser(upstream),
            );

        const previewChartBindings = async (previewUuid: string) =>
            (
                await database('saved_sql_versions')
                    .innerJoin(
                        'saved_sql',
                        'saved_sql.saved_sql_uuid',
                        'saved_sql_versions.saved_sql_uuid',
                    )
                    .where('saved_sql.project_uuid', previewUuid)
                    .orderBy('saved_sql.name')
                    .select(
                        'saved_sql.name',
                        'saved_sql_versions.warehouse_connection_uuid',
                    )
            ).map((row) => [row.name, row.warehouse_connection_uuid]);

        test('SQL charts and virtual views of a multi upstream copy with each binding remapped and NULL kept', async () => {
            const upstream = await createProject({ mode: 'multi' });
            const previewUuid = await createPreview(upstream, 'github');
            await database('saved_sql').insert([
                {
                    name: 'a extra chart',
                    project_uuid: upstream.projectUuid,
                    space_uuid: upstream.spaceUuid,
                    slug: `a-${randomUUID()}`,
                },
                {
                    name: 'b original chart',
                    project_uuid: upstream.projectUuid,
                    space_uuid: upstream.spaceUuid,
                    slug: `b-${randomUUID()}`,
                },
            ] as never);
            const charts = await database('saved_sql')
                .where('project_uuid', upstream.projectUuid)
                .orderBy('name')
                .select('saved_sql_uuid');
            await database('saved_sql_versions').insert([
                {
                    saved_sql_uuid: charts[0].saved_sql_uuid,
                    sql: 'select 1',
                    limit: 10,
                    config: JSON.stringify(tableConfig),
                    chart_kind: ChartKind.TABLE,
                    warehouse_connection_uuid: upstream.extraConnectionUuid,
                },
                {
                    saved_sql_uuid: charts[1].saved_sql_uuid,
                    sql: 'select 1',
                    limit: 10,
                    config: JSON.stringify(tableConfig),
                    chart_kind: ChartKind.TABLE,
                    warehouse_connection_uuid: null,
                },
            ] as never);
            await database('cached_explore').insert([
                {
                    project_uuid: upstream.projectUuid,
                    name: 'extra_view',
                    table_names: ['extra_view'],
                    explore: JSON.stringify({
                        ...explore('extra_view'),
                        type: 'virtual',
                    }),
                    warehouse_connection_uuid: upstream.extraConnectionUuid,
                },
                {
                    project_uuid: upstream.projectUuid,
                    name: 'original_view',
                    table_names: ['original_view'],
                    explore: JSON.stringify({
                        ...explore('original_view'),
                        type: 'virtual',
                    }),
                    warehouse_connection_uuid: null,
                },
            ] as never);

            await copyContent(upstream, previewUuid);

            expect(await previewChartBindings(previewUuid)).toEqual([
                [
                    'a extra chart',
                    (await connectionsByName(previewUuid)).Finance,
                ],
                ['b original chart', null],
            ]);
            expect(await exploreBindings(previewUuid)).toEqual({
                extra_view: (await connectionsByName(previewUuid)).Finance,
                original_view: null,
            });
        });

        test('a renamed preview connection refuses the whole copy with the reason', async () => {
            const upstream = await createProject({ mode: 'multi' });
            const previewUuid = await createPreview(upstream, 'github');
            await createSqlChart(
                upstream,
                'select 1',
                upstream.extraConnectionUuid,
            );
            await database('warehouse_connections')
                .where('project_uuid', previewUuid)
                .where('name', 'Finance')
                .update({ name: 'Finance (renamed)' });

            await expect(copyContent(upstream, previewUuid)).rejects.toThrow(
                renamedMessage('Finance'),
            );
            expect(await previewChartBindings(previewUuid)).toEqual([]);
        });
    });
});
