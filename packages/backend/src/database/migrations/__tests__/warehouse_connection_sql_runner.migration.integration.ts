import { Ability } from '@casl/ability';
import {
    AthenaAuthenticationType,
    DimensionType,
    ForbiddenError,
    MissingWarehouseCredentialsError,
    NotFoundError,
    SingleConnectionProjectError,
    WarehouseDatabaseListingNotSupportedError,
    WarehouseTableType,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type PossibleAbilities,
    type SessionAccount,
    type WarehouseClient,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { WarehouseConnectionTablesModel } from '../../../models/WarehouseConnectionTablesModel/WarehouseConnectionTablesModel';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    createMigratedDatabase,
    getPostgresServer,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const SECRET = 'warehouse-connection-sql-runner-test-secret';
const RUN = randomUUID().replaceAll('-', '').slice(0, 10);
const ORIGINAL_DATABASE = `pr9_original_${RUN}`;
const EXTRA_DATABASE = `pr9_extra_${RUN}`;
const SALES_DATABASE = `pr9_sales_${RUN}`;
const UNOPENABLE_DATABASE = `pr9_sales_${RUN}?sslmode=require`;

type SqlRunnerApi = Pick<
    ProjectService,
    | 'getSqlRunnerConnections'
    | 'getConnectionDatabases'
    | 'getConnectionTables'
    | 'refreshConnectionTables'
    | 'getConnectionTableFields'
    | '_getWarehouseClient'
>;

type Fixture = {
    projectUuid: string;
    organizationUuid: string;
    userUuid: string;
    originalUuid: string | null;
    extraUuid: string | null;
    developer: SessionAccount;
    viewer: SessionAccount;
};

describe('SQL runner catalog by connection on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let warehouseAdmin: Knex;
    let encryptionUtil: EncryptionUtil;
    let service: SqlRunnerApi;
    let tablesModel: WarehouseConnectionTablesModel;

    const server = () => getPostgresServer();

    const postgresCredentials = (
        dbname: string,
    ): CreatePostgresCredentials => ({
        type: WarehouseTypes.POSTGRES,
        host: server().host,
        port: server().port,
        user: server().user,
        password: server().password,
        dbname,
        schema: 'public',
        sslmode: 'disable',
    });

    const encrypt = (value: unknown) =>
        encryptionUtil.encrypt(JSON.stringify(value));

    const account = (
        userUuid: string,
        organizationUuid: string,
        rules: { subject: string; action: string }[],
    ) =>
        fromSession(
            {
                ...defaultSessionUser,
                userUuid,
                organizationUuid,
                ability: new Ability<PossibleAbilities>(rules as never),
            },
            'session-cookie',
        );

    const createProject = async ({
        mode,
        withExtra,
        originalCredentials = postgresCredentials(ORIGINAL_DATABASE),
        extraCredentials = postgresCredentials(EXTRA_DATABASE),
        listAllDatabases = false,
        additionalDatabases = [],
    }: {
        mode: 'single' | 'multi';
        withExtra: boolean;
        originalCredentials?: CreateWarehouseCredentials;
        extraCredentials?: CreateWarehouseCredentials;
        listAllDatabases?: boolean;
        additionalDatabases?: string[];
    }): Promise<Fixture> => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'SQL runner connections' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'Developer' } as never)
            .returning('user_uuid');
        const [project] = await database('projects')
            .insert({
                name: 'SQL runner project',
                organization_id: organization.organization_id,
                connection_mode: mode,
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: originalCredentials.type,
            encrypted_credentials: encrypt(originalCredentials),
        } as never);
        let originalUuid: string | null = null;
        let extraUuid: string | null = null;
        if (mode === 'multi') {
            [{ warehouse_connection_uuid: originalUuid }] = await database(
                'warehouse_connections',
            )
                .insert({
                    project_uuid: project.project_uuid,
                    is_original: true,
                    name: 'Original',
                })
                .returning('warehouse_connection_uuid');
            if (withExtra) {
                [{ warehouse_connection_uuid: extraUuid }] = await database(
                    'warehouse_connections',
                )
                    .insert({
                        project_uuid: project.project_uuid,
                        is_original: false,
                        name: 'Finance',
                        warehouse_type: extraCredentials.type,
                        encrypted_credentials: encrypt(extraCredentials),
                        list_all_databases: listAllDatabases,
                        additional_databases: additionalDatabases,
                    })
                    .returning('warehouse_connection_uuid');
            }
        }
        const organizationUuid = organization.organization_uuid as string;
        const userUuid = user.user_uuid as string;
        return {
            projectUuid: project.project_uuid,
            organizationUuid,
            userUuid,
            originalUuid,
            extraUuid,
            developer: account(userUuid, organizationUuid, [
                { subject: 'SqlRunner', action: 'manage' },
            ]),
            viewer: account(userUuid, organizationUuid, [
                { subject: 'Project', action: 'view' },
            ]),
        };
    };

    const createWarehouseDatabase = async (
        name: string,
        statements: string[],
    ) => {
        await warehouseAdmin.raw('CREATE DATABASE ??', [name]);
        const connection = knex({
            client: 'pg',
            connection: {
                host: server().host,
                port: server().port,
                user: server().user,
                password: server().password,
                database: name,
            },
        });
        try {
            await statements.reduce<Promise<unknown>>(
                (previous, statement) =>
                    previous.then(() => connection.raw(statement)),
                Promise.resolve(),
            );
        } finally {
            await connection.destroy();
        }
    };

    const createUser = async (): Promise<string> => {
        const [user] = await database('users')
            .insert({ first_name: 'Other', last_name: 'Developer' } as never)
            .returning('user_uuid');
        return user.user_uuid as string;
    };

    const developer = (userUuid: string, organizationUuid: string) =>
        account(userUuid, organizationUuid, [
            { subject: 'SqlRunner', action: 'manage' },
        ]);

    const createPersonalCredential = async (
        userUuid: string,
        projectUuid: string,
        warehouseType: WarehouseTypes = WarehouseTypes.POSTGRES,
    ): Promise<string> => {
        const [row] = await database('user_warehouse_credentials')
            .insert({
                user_uuid: userUuid,
                name: `Personal ${warehouseType}`,
                warehouse_type: warehouseType,
                encrypted_credentials: encrypt(
                    warehouseType === WarehouseTypes.POSTGRES
                        ? {
                              type: WarehouseTypes.POSTGRES,
                              user: server().user,
                              password: server().password,
                          }
                        : {
                              type: WarehouseTypes.SNOWFLAKE,
                              user: 'snow',
                              password: 'flake',
                          },
                ),
                project_uuid: projectUuid,
            } as never)
            .returning('user_warehouse_credentials_uuid');
        return row.user_warehouse_credentials_uuid as string;
    };

    const createPersonalCredentialsProject = () =>
        createProject({
            mode: 'multi',
            withExtra: true,
            originalCredentials: {
                ...postgresCredentials(ORIGINAL_DATABASE),
                requireUserCredentials: true,
            },
        });

    const cacheRows = (extraUuid: string) =>
        database('warehouse_connection_tables')
            .where('warehouse_connection_uuid', extraUuid)
            .select('user_warehouse_credentials_uuid', 'table')
            .orderBy(['user_warehouse_credentials_uuid', 'table']);

    const runOnWarehouse = async (name: string, statement: string) => {
        const connection = knex({
            client: 'pg',
            connection: {
                host: server().host,
                port: server().port,
                user: server().user,
                password: server().password,
                database: name,
            },
        });
        try {
            await connection.raw(statement);
        } finally {
            await connection.destroy();
        }
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        warehouseAdmin = knex({
            client: 'pg',
            connection: {
                host: server().host,
                port: server().port,
                user: server().user,
                password: server().password,
                database: server().adminDatabase,
            },
        });
        await createWarehouseDatabase(ORIGINAL_DATABASE, [
            'CREATE TABLE public.orders (id integer)',
        ]);
        await createWarehouseDatabase(EXTRA_DATABASE, [
            'CREATE TABLE public.ledger (id integer, amount numeric)',
        ]);
        await createWarehouseDatabase(SALES_DATABASE, [
            'CREATE SCHEMA reporting',
            'CREATE TABLE reporting.invoices (id integer, total numeric, issued_on date)',
            'CREATE VIEW reporting.invoice_totals AS SELECT total FROM reporting.invoices',
        ]);
        await warehouseAdmin.raw('CREATE DATABASE ??', [UNOPENABLE_DATABASE]);
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
        const organizationWarehouseCredentialsModel =
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
        tablesModel = new WarehouseConnectionTablesModel({ database });
        service = new ProjectService({
            lightdashConfig: lightdashConfigMock,
            projectModel: new ProjectModel({
                database,
                lightdashConfig: lightdashConfigMock,
                encryptionUtil,
            }),
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
            organizationWarehouseCredentialsModel,
            warehouseConnectionModel: new WarehouseConnectionModel({
                database,
                encryptionUtil,
                organizationWarehouseCredentialsModel,
            }),
            warehouseConnectionTablesModel: tablesModel,
        } as never);
    }, 600000);

    afterAll(async () => {
        await Promise.all(
            [
                ORIGINAL_DATABASE,
                EXTRA_DATABASE,
                SALES_DATABASE,
                UNOPENABLE_DATABASE,
            ].map((name) =>
                warehouseAdmin?.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                    name,
                ]),
            ),
        );
        await warehouseAdmin?.destroy();
        await migrated?.destroy();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('refuses projects that do not route multi', () => {
        test.each([
            { name: 'a single project', mode: 'single' as const },
            {
                name: 'a multi project with no extra connection',
                mode: 'multi' as const,
            },
        ])('$name', async ({ mode }) => {
            const fixture = await createProject({ mode, withExtra: false });
            const connectionUuid = fixture.originalUuid ?? randomUUID();

            await expect(
                service.getSqlRunnerConnections(
                    fixture.developer,
                    fixture.projectUuid,
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
            await expect(
                service.getConnectionDatabases(
                    fixture.developer,
                    fixture.projectUuid,
                    connectionUuid,
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
            await expect(
                service.getConnectionTables(
                    fixture.developer,
                    fixture.projectUuid,
                    connectionUuid,
                    ORIGINAL_DATABASE,
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
            await expect(
                service.getConnectionTableFields(
                    fixture.developer,
                    fixture.projectUuid,
                    connectionUuid,
                    {
                        databaseName: ORIGINAL_DATABASE,
                        schemaName: 'public',
                        tableName: 'orders',
                    },
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
            await expect(
                service.refreshConnectionTables(
                    fixture.developer,
                    fixture.projectUuid,
                    connectionUuid,
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
        });
    });

    test('refuses a user who cannot manage the SQL runner', async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });

        await expect(
            service.getSqlRunnerConnections(
                fixture.viewer,
                fixture.projectUuid,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            service.getConnectionDatabases(
                fixture.viewer,
                fixture.projectUuid,
                fixture.extraUuid!,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('lists every connection with the original first', async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });

        await expect(
            service.getSqlRunnerConnections(
                fixture.developer,
                fixture.projectUuid,
            ),
        ).resolves.toEqual([
            {
                warehouseConnectionUuid: fixture.originalUuid,
                name: 'Original',
                isOriginal: true,
                warehouseType: WarehouseTypes.POSTGRES,
            },
            {
                warehouseConnectionUuid: fixture.extraUuid,
                name: 'Finance',
                isOriginal: false,
                warehouseType: WarehouseTypes.POSTGRES,
            },
        ]);
    });

    test("refuses another project's connection", async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });
        const other = await createProject({ mode: 'multi', withExtra: true });

        await expect(
            service.getConnectionDatabases(
                fixture.developer,
                fixture.projectUuid,
                other.extraUuid!,
            ),
        ).rejects.toThrow('Connection not found');
        await expect(
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                other.extraUuid!,
                EXTRA_DATABASE,
            ),
        ).rejects.toThrow('Connection not found');
    });

    test("lists the original's and the extra connection's own databases", async () => {
        const fixture = await createProject({
            mode: 'multi',
            withExtra: true,
            additionalDatabases: [SALES_DATABASE],
        });

        await expect(
            service.getConnectionDatabases(
                fixture.developer,
                fixture.projectUuid,
                fixture.originalUuid!,
            ),
        ).resolves.toEqual({
            databases: [
                {
                    name: ORIGINAL_DATABASE,
                    database: ORIGINAL_DATABASE,
                    schema: null,
                    isDefault: true,
                },
            ],
            truncated: false,
            limit: 100,
        });
        await expect(
            service.getConnectionDatabases(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
            ),
        ).resolves.toEqual({
            databases: [
                {
                    name: EXTRA_DATABASE,
                    database: EXTRA_DATABASE,
                    schema: null,
                    isDefault: true,
                },
                {
                    name: SALES_DATABASE,
                    database: SALES_DATABASE,
                    schema: null,
                    isDefault: false,
                },
            ],
            truncated: false,
            limit: 100,
        });
    });

    test('lists every database on the server with a bound limit and leaves out names the connection string cannot carry', async () => {
        const fixture = await createProject({
            mode: 'multi',
            withExtra: true,
            listAllDatabases: true,
        });

        const listing = await service.getConnectionDatabases(
            fixture.developer,
            fixture.projectUuid,
            fixture.extraUuid!,
        );
        const names = listing.databases.map(({ name }) => name);

        expect(names[0]).toBe(EXTRA_DATABASE);
        expect(names).toContain(SALES_DATABASE);
        expect(names).toContain(ORIGINAL_DATABASE);
        expect(names).not.toContain(UNOPENABLE_DATABASE);
    });

    test('leaves out names the connection string cannot carry before it applies the listing limit', async () => {
        const unopenable = Array.from(
            { length: 101 },
            (_, index) =>
                `0pr9_${RUN}_${String(index).padStart(3, '0')}?sslmode=require`,
        );
        await unopenable.reduce<Promise<unknown>>(
            (previous, name) =>
                previous.then(() =>
                    warehouseAdmin.raw('CREATE DATABASE ??', [name]),
                ),
            Promise.resolve(),
        );
        try {
            const fixture = await createProject({
                mode: 'multi',
                withExtra: true,
                listAllDatabases: true,
            });

            const listing = await service.getConnectionDatabases(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
            );
            const names = listing.databases.map(({ name }) => name);

            expect(names).toContain(SALES_DATABASE);
            expect(names).toContain(ORIGINAL_DATABASE);
            expect(names.filter((name) => name.includes('?'))).toEqual([]);
        } finally {
            await Promise.all(
                unopenable.map((name) =>
                    warehouseAdmin.raw(
                        'DROP DATABASE IF EXISTS ?? WITH (FORCE)',
                        [name],
                    ),
                ),
            );
        }
    });

    test('reads tables from a listed database on the same server and caches them per connection', async () => {
        const fixture = await createProject({
            mode: 'multi',
            withExtra: true,
            additionalDatabases: [SALES_DATABASE],
        });

        const catalog = await service.getConnectionTables(
            fixture.developer,
            fixture.projectUuid,
            fixture.extraUuid!,
            SALES_DATABASE,
        );

        expect(catalog).toEqual({
            [SALES_DATABASE]: {
                reporting: {
                    invoices: {
                        partitionColumn: undefined,
                        tableType: WarehouseTableType.TABLE,
                    },
                    invoice_totals: {
                        partitionColumn: undefined,
                        tableType: WarehouseTableType.VIEW,
                    },
                },
            },
        });
        const rows = await database('warehouse_connection_tables').where(
            'warehouse_connection_uuid',
            fixture.extraUuid,
        );
        expect(
            rows
                .map((row) => ({
                    listed_database: row.listed_database,
                    user_warehouse_credentials_uuid:
                        row.user_warehouse_credentials_uuid,
                    table: row.table,
                }))
                .sort((a, b) => (a.table < b.table ? -1 : 1)),
        ).toEqual([
            {
                listed_database: SALES_DATABASE,
                user_warehouse_credentials_uuid: null,
                table: 'invoice_totals',
            },
            {
                listed_database: SALES_DATABASE,
                user_warehouse_credentials_uuid: null,
                table: 'invoices',
            },
        ]);
        expect(
            await database('warehouse_credentials_available_tables').where(
                'table',
                'invoices',
            ),
        ).toEqual([]);
    });

    test("keys a personal credential's catalog by that credential", async () => {
        const fixture = await createProject({
            mode: 'multi',
            withExtra: true,
            originalCredentials: {
                ...postgresCredentials(ORIGINAL_DATABASE),
                requireUserCredentials: true,
            },
        });
        const [personal] = await database('user_warehouse_credentials')
            .insert({
                user_uuid: fixture.userUuid,
                name: 'Personal',
                warehouse_type: WarehouseTypes.POSTGRES,
                encrypted_credentials: encrypt({
                    type: WarehouseTypes.POSTGRES,
                    user: server().user,
                    password: server().password,
                }),
                project_uuid: fixture.projectUuid,
            } as never)
            .returning('user_warehouse_credentials_uuid');
        const [otherUser] = await database('users')
            .insert({ first_name: 'Other', last_name: 'User' } as never)
            .returning('user_uuid');

        await service.getConnectionTables(
            fixture.developer,
            fixture.projectUuid,
            fixture.extraUuid!,
            EXTRA_DATABASE,
        );

        expect(
            await database('warehouse_connection_tables')
                .where('warehouse_connection_uuid', fixture.extraUuid)
                .distinct('user_warehouse_credentials_uuid')
                .pluck('user_warehouse_credentials_uuid'),
        ).toEqual([personal.user_warehouse_credentials_uuid]);
        await expect(
            service.getConnectionTables(
                account(otherUser.user_uuid, fixture.organizationUuid, [
                    { subject: 'SqlRunner', action: 'manage' },
                ]),
                fixture.projectUuid,
                fixture.extraUuid!,
                EXTRA_DATABASE,
            ),
        ).rejects.toThrow();
    });

    test('two users with their own personal credentials each get a cold read and their own cache rows', async () => {
        const fixture = await createPersonalCredentialsProject();
        const userB = await createUser();
        const credentialA = await createPersonalCredential(
            fixture.userUuid,
            fixture.projectUuid,
        );
        const credentialB = await createPersonalCredential(
            userB,
            fixture.projectUuid,
        );
        const getClient = vi.spyOn(service, '_getWarehouseClient');
        const read = (userUuid: string) =>
            service.getConnectionTables(
                developer(userUuid, fixture.organizationUuid),
                fixture.projectUuid,
                fixture.extraUuid!,
                EXTRA_DATABASE,
            );

        await read(fixture.userUuid);
        expect(getClient).toHaveBeenCalledTimes(1);
        expect(await cacheRows(fixture.extraUuid!)).toEqual([
            { user_warehouse_credentials_uuid: credentialA, table: 'ledger' },
        ]);

        await read(userB);
        expect(getClient).toHaveBeenCalledTimes(2);
        expect(await cacheRows(fixture.extraUuid!)).toEqual(
            [
                {
                    user_warehouse_credentials_uuid: credentialA,
                    table: 'ledger',
                },
                {
                    user_warehouse_credentials_uuid: credentialB,
                    table: 'ledger',
                },
            ].sort((a, b) =>
                a.user_warehouse_credentials_uuid <
                b.user_warehouse_credentials_uuid
                    ? -1
                    : 1,
            ),
        );

        await read(fixture.userUuid);
        expect(getClient).toHaveBeenCalledTimes(2);
    });

    test("one user's refresh clears only that user's rows", async () => {
        const fixture = await createPersonalCredentialsProject();
        const userB = await createUser();
        const credentialA = await createPersonalCredential(
            fixture.userUuid,
            fixture.projectUuid,
        );
        const credentialB = await createPersonalCredential(
            userB,
            fixture.projectUuid,
        );
        await Promise.all(
            [fixture.userUuid, userB].map((userUuid) =>
                service.getConnectionTables(
                    developer(userUuid, fixture.organizationUuid),
                    fixture.projectUuid,
                    fixture.extraUuid!,
                    EXTRA_DATABASE,
                ),
            ),
        );

        await service.refreshConnectionTables(
            developer(fixture.userUuid, fixture.organizationUuid),
            fixture.projectUuid,
            fixture.extraUuid!,
        );

        expect(credentialA).not.toBe(credentialB);
        expect(await cacheRows(fixture.extraUuid!)).toEqual([
            { user_warehouse_credentials_uuid: credentialB, table: 'ledger' },
        ]);
    });

    test('a user without a personal credential is refused before any warehouse read and leaves no cache row', async () => {
        const fixture = await createPersonalCredentialsProject();
        const getClient = vi.spyOn(service, '_getWarehouseClient');

        await expect(
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                EXTRA_DATABASE,
            ),
        ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
        await expect(
            service.getConnectionDatabases(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
            ),
        ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
        expect(getClient).not.toHaveBeenCalled();
        expect(await cacheRows(fixture.extraUuid!)).toEqual([]);
    });

    test('a saved choice of a credential of another warehouse type is not used', async () => {
        const fixture = await createPersonalCredentialsProject();
        const snowflakeCredential = await createPersonalCredential(
            fixture.userUuid,
            fixture.projectUuid,
            WarehouseTypes.SNOWFLAKE,
        );
        await database(
            'warehouse_connection_user_credentials_preference',
        ).insert({
            user_uuid: fixture.userUuid,
            warehouse_connection_uuid: fixture.extraUuid,
            user_warehouse_credentials_uuid: snowflakeCredential,
        });
        const getClient = vi.spyOn(service, '_getWarehouseClient');

        await expect(
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                EXTRA_DATABASE,
            ),
        ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
        expect(getClient).not.toHaveBeenCalled();
        expect(await cacheRows(fixture.extraUuid!)).toEqual([]);
    });

    test('the cache read itself is scoped by project, not only the connection lookup', async () => {
        const owner = await createProject({ mode: 'multi', withExtra: true });
        const other = await createProject({ mode: 'multi', withExtra: true });
        const scope = (projectUuid: string) => ({
            projectUuid,
            warehouseConnectionUuid: owner.extraUuid!,
            userWarehouseCredentialsUuid: null,
        });
        await service.getConnectionTables(
            owner.developer,
            owner.projectUuid,
            owner.extraUuid!,
            EXTRA_DATABASE,
        );
        expect(await cacheRows(owner.extraUuid!)).toHaveLength(1);

        await expect(
            tablesModel.getTables(scope(other.projectUuid), EXTRA_DATABASE),
        ).resolves.toBeNull();
        await expect(
            tablesModel.getTables(scope(owner.projectUuid), EXTRA_DATABASE),
        ).resolves.not.toBeNull();
        await expect(
            tablesModel.clearTables(scope(other.projectUuid)),
        ).rejects.toThrow('Connection not found');
        expect(await cacheRows(owner.extraUuid!)).toHaveLength(1);
    });

    test('serves the cache until a refresh, then reads the warehouse again', async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });
        const read = () =>
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                EXTRA_DATABASE,
            );

        await read();
        await runOnWarehouse(
            EXTRA_DATABASE,
            'CREATE TABLE public.budgets (id integer)',
        );
        expect(Object.keys((await read())[EXTRA_DATABASE].public)).toEqual([
            'ledger',
        ]);

        await service.refreshConnectionTables(
            fixture.developer,
            fixture.projectUuid,
            fixture.extraUuid!,
        );

        expect(
            Object.keys((await read())[EXTRA_DATABASE].public).sort(),
        ).toEqual(['budgets', 'ledger']);
        await runOnWarehouse(EXTRA_DATABASE, 'DROP TABLE public.budgets');
    });

    test("keeps the original's catalog out of main's table", async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });

        await expect(
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                fixture.originalUuid!,
                ORIGINAL_DATABASE,
            ),
        ).resolves.toEqual({
            [ORIGINAL_DATABASE]: {
                public: {
                    orders: {
                        partitionColumn: undefined,
                        tableType: WarehouseTableType.TABLE,
                    },
                },
            },
        });
        expect(
            await database('warehouse_connection_tables')
                .where('warehouse_connection_uuid', fixture.originalUuid)
                .pluck('table'),
        ).toEqual(['orders']);
        expect(
            await database('warehouse_credentials_available_tables').where(
                'table',
                'orders',
            ),
        ).toEqual([]);
    });

    test('refuses tables of a database the connection does not list', async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });

        await expect(
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                SALES_DATABASE,
            ),
        ).rejects.toThrow(`Warehouse database "${SALES_DATABASE}" not found`);
    });

    test('reports a listed database whose name the connection string cannot carry', async () => {
        const fixture = await createProject({
            mode: 'multi',
            withExtra: true,
            additionalDatabases: [UNOPENABLE_DATABASE],
        });

        await expect(
            service.getConnectionTables(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                UNOPENABLE_DATABASE,
            ),
        ).rejects.toThrow(
            `Database "${UNOPENABLE_DATABASE}" cannot be opened: its name contains one of ; / ? : @ & = + $ , #`,
        );
    });

    test('reads fields of a table in a listed database on the same server', async () => {
        const fixture = await createProject({
            mode: 'multi',
            withExtra: true,
            additionalDatabases: [SALES_DATABASE],
        });

        await expect(
            service.getConnectionTableFields(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                {
                    databaseName: SALES_DATABASE,
                    schemaName: 'reporting',
                    tableName: 'invoices',
                },
            ),
        ).resolves.toEqual({
            id: DimensionType.NUMBER,
            total: DimensionType.NUMBER,
            issued_on: DimensionType.DATE,
        });
    });

    test('refuses fields from a database the connection does not list', async () => {
        const fixture = await createProject({ mode: 'multi', withExtra: true });
        const getClient = vi.spyOn(service, '_getWarehouseClient');

        await expect(
            service.getConnectionTableFields(
                fixture.developer,
                fixture.projectUuid,
                fixture.extraUuid!,
                {
                    databaseName: SALES_DATABASE,
                    schemaName: 'reporting',
                    tableName: 'invoices',
                },
            ),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(getClient).not.toHaveBeenCalled();
    });

    describe('with stubbed warehouse clients', () => {
        const stubClient = (client: Partial<WarehouseClient>) =>
            vi.spyOn(service, '_getWarehouseClient').mockResolvedValue({
                warehouseClient: client as WarehouseClient,
                sshTunnel: { disconnect: vi.fn() } as never,
                tunnelConnectMs: null,
            });

        test('lists tables for a non-listing warehouse on a cold cache', async () => {
            const snowflakeCredentials: CreateSnowflakeCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'user',
                password: 'password',
                role: 'role',
                database: 'ANALYTICS',
                warehouse: 'warehouse',
                schema: 'PUBLIC',
            };
            const fixture = await createProject({
                mode: 'multi',
                withExtra: true,
                extraCredentials: snowflakeCredentials,
            });
            const getAllTables = vi.fn(async () => [
                {
                    database: 'ANALYTICS',
                    schema: 'PUBLIC',
                    table: 'ORDERS',
                    tableType: WarehouseTableType.TABLE,
                },
            ]);
            const getTablesForDatabase = vi.fn(async () => {
                throw new WarehouseDatabaseListingNotSupportedError(
                    WarehouseTypes.SNOWFLAKE,
                );
            });
            stubClient({ getAllTables, getTablesForDatabase });

            await expect(
                service.getConnectionDatabases(
                    fixture.developer,
                    fixture.projectUuid,
                    fixture.extraUuid!,
                ),
            ).resolves.toEqual({
                databases: [
                    {
                        name: 'analytics',
                        database: 'analytics',
                        schema: null,
                        isDefault: true,
                    },
                ],
                truncated: false,
                limit: 100,
            });
            await expect(
                service.getConnectionTables(
                    fixture.developer,
                    fixture.projectUuid,
                    fixture.extraUuid!,
                    'analytics',
                ),
            ).resolves.toEqual({
                ANALYTICS: {
                    PUBLIC: {
                        ORDERS: {
                            partitionColumn: undefined,
                            tableType: WarehouseTableType.TABLE,
                        },
                    },
                },
            });
            expect(getTablesForDatabase).not.toHaveBeenCalled();
            expect(getAllTables).toHaveBeenCalledOnce();
        });

        test('returns fields for an Athena catalog requested by its database', async () => {
            const athenaCredentials: CreateAthenaCredentials = {
                type: WarehouseTypes.ATHENA,
                region: 'eu-west-1',
                database: 'AwsDataCatalog',
                schema: 'analytics',
                s3StagingDir: 's3://staging/',
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                accessKeyId: 'key',
                secretAccessKey: 'secret',
            };
            const fixture = await createProject({
                mode: 'multi',
                withExtra: true,
                extraCredentials: athenaCredentials,
                additionalDatabases: ['sales'],
            });
            const getFields = vi.fn(async () => ({
                AwsDataCatalog: {
                    sales: {
                        invoices: { total: DimensionType.NUMBER },
                    },
                },
            }));
            stubClient({ getFields });

            await expect(
                service.getConnectionTableFields(
                    fixture.developer,
                    fixture.projectUuid,
                    fixture.extraUuid!,
                    {
                        databaseName: 'AwsDataCatalog',
                        schemaName: 'sales',
                        tableName: 'invoices',
                    },
                ),
            ).resolves.toEqual({ total: DimensionType.NUMBER });
            expect(getFields).toHaveBeenCalledWith(
                'invoices',
                'sales',
                'AwsDataCatalog',
                expect.objectContaining({ project_uuid: fixture.projectUuid }),
            );
            await expect(
                service.getConnectionTableFields(
                    fixture.developer,
                    fixture.projectUuid,
                    fixture.extraUuid!,
                    {
                        databaseName: 'OtherCatalog',
                        schemaName: 'sales',
                        tableName: 'invoices',
                    },
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
        });
    });
});
