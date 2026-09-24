import { Ability } from '@casl/ability';
import {
    AthenaAuthenticationType,
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SingleConnectionProjectError,
    SnowflakeAuthenticationType,
    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type PossibleAbilities,
    type SessionAccount,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EnterpriseLicenseService } from '../../../ee/services/LicenseService/LicenseService';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { LicenseService } from '../../../services/LicenseService/LicenseService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    ENTITLEMENT_REASON,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
    WarehouseConnectionService,
} from '../../../services/WarehouseConnectionService/WarehouseConnectionService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

const SECRET = 'warehouse-connection-service-test-secret';

const postgresCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    user: 'analyst',
    password: 'analyst-password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const athenaCredentials: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'AwsDataCatalog',
    schema: 'analytics',
    s3StagingDir: 's3://staging',
    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
    accessKeyId: 'access-key',
    secretAccessKey: 'secret-key',
};

const snowflakeCredentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'user',
    password: 'password',
    database: 'analytics',
    warehouse: 'compute',
    schema: 'public',
};

type Fixture = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    originalUuid: string | null;
    admin: SessionAccount;
    credentialsAdmin: SessionAccount;
    viewer: SessionAccount;
};

describe('WarehouseConnectionService on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let encryptionUtil: EncryptionUtil;
    let model: WarehouseConnectionModel;
    let projectService: ProjectService;
    const flag = { enabled: true };
    const testWarehouseConnectionCredentials = vi.fn();

    const buildService = (licensed = true) =>
        new WarehouseConnectionService({
            warehouseConnectionModel: model,
            projectModel: new ProjectModel({
                database,
                lightdashConfig: lightdashConfigMock,
                encryptionUtil,
            }),
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
            featureFlagService: {
                get: vi.fn(async () => ({
                    id: FeatureFlags.MultiConnectionProjects,
                    enabled: flag.enabled,
                })),
            },
            licenseService: licensed
                ? new EnterpriseLicenseService({ licenseKey: 'licence' })
                : new LicenseService({ licenseKey: null }),
            credentialPolicy: {
                assertCanWriteWarehouseConnection: (account, project, data) =>
                    projectService.assertCanWriteWarehouseConnection(
                        account,
                        project,
                        data,
                    ),
                testWarehouseConnectionCredentials,
            },
        });

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
        warehouseType = WarehouseTypes.POSTGRES,
        credentials = postgresCredentials,
        provisioningSource = null,
    }: {
        mode: 'single' | 'multi';
        warehouseType?: WarehouseTypes;
        credentials?: CreateWarehouseCredentials;
        provisioningSource?: string | null;
    }): Promise<Fixture> => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Connections test' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'Admin' } as never)
            .returning('user_uuid');
        const [project] = await database('projects')
            .insert({
                name: 'Connections project',
                organization_id: organization.organization_id,
                connection_mode: mode,
                provisioning_source: provisioningSource,
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: warehouseType,
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(credentials),
            ),
        } as never);
        const original =
            mode === 'multi'
                ? (
                      await database('warehouse_connections')
                          .insert({
                              project_uuid: project.project_uuid,
                              is_original: true,
                              name: 'Original',
                          })
                          .returning('warehouse_connection_uuid')
                  )[0].warehouse_connection_uuid
                : null;
        return {
            organizationUuid: organization.organization_uuid,
            projectUuid: project.project_uuid,
            userUuid: user.user_uuid,
            originalUuid: original,
            admin: account(user.user_uuid, organization.organization_uuid, [
                { subject: 'Project', action: 'manage' },
            ]),
            credentialsAdmin: account(
                user.user_uuid,
                organization.organization_uuid,
                [
                    { subject: 'Project', action: 'manage' },
                    {
                        subject: 'OrganizationWarehouseCredentials',
                        action: 'view',
                    },
                ],
            ),
            viewer: account(user.user_uuid, organization.organization_uuid, [
                { subject: 'Project', action: 'view' },
            ]),
        };
    };

    const createOrganizationCredential = async (
        organizationUuid: string,
        credentials: CreateWarehouseCredentials = postgresCredentials,
    ) =>
        (
            await database('organization_warehouse_credentials')
                .insert({
                    organization_uuid: organizationUuid,
                    name: `Shared ${randomUUID()}`,
                    warehouse_type: credentials.type,
                    warehouse_connection: encryptionUtil.encrypt(
                        JSON.stringify(credentials),
                    ),
                } as never)
                .returning('organization_warehouse_credentials_uuid')
        )[0].organization_warehouse_credentials_uuid as string;

    const addExtra = (fixture: Fixture, name = 'Finance') =>
        buildService().create(fixture.credentialsAdmin, fixture.projectUuid, {
            name,
            warehouseConnection: postgresCredentials,
        });

    const countConnections = async (projectUuid: string) =>
        Number(
            (
                await database('warehouse_connections')
                    .where('project_uuid', projectUuid)
                    .count<{ count: string }[]>({ count: '*' })
            )[0].count,
        );

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase(
            'warehouse_connection_service',
        );
        database = migrated.database;
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
        model = new WarehouseConnectionModel({
            database,
            encryptionUtil,
            organizationWarehouseCredentialsModel:
                new OrganizationWarehouseCredentialsModel({
                    database,
                    encryptionUtil,
                }),
        });
        projectService = new ProjectService({} as never);
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        flag.enabled = true;
        testWarehouseConnectionCredentials.mockReset();
        testWarehouseConnectionCredentials.mockResolvedValue({
            ok: true,
            hops: [{ stage: 'database', status: 'ok', message: null }],
        });
    });

    describe('single projects', () => {
        test('every call is refused and nothing is written', async () => {
            const fixture = await createProject({ mode: 'single' });
            const service = buildService();
            const someUuid = randomUUID();

            await Promise.all(
                [
                    service.list(fixture.admin, fixture.projectUuid),
                    service.get(fixture.admin, fixture.projectUuid, someUuid),
                    service.create(fixture.admin, fixture.projectUuid, {
                        name: 'Finance',
                        warehouseConnection: postgresCredentials,
                    }),
                    service.update(
                        fixture.admin,
                        fixture.projectUuid,
                        someUuid,
                        {
                            listAllDatabases: true,
                        },
                    ),
                    service.rename(
                        fixture.admin,
                        fixture.projectUuid,
                        someUuid,
                        'Renamed',
                    ),
                    service.delete(
                        fixture.admin,
                        fixture.projectUuid,
                        someUuid,
                    ),
                ].map((call) =>
                    expect(call).rejects.toBeInstanceOf(
                        SingleConnectionProjectError,
                    ),
                ),
            );
            expect(await countConnections(fixture.projectUuid)).toBe(0);
            expect(testWarehouseConnectionCredentials).not.toHaveBeenCalled();
        });
    });

    describe('permissions', () => {
        test('requires project management for every call', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const service = buildService();

            await expect(
                service.list(fixture.viewer, fixture.projectUuid),
            ).rejects.toBeInstanceOf(ForbiddenError);
            await expect(
                service.create(fixture.viewer, fixture.projectUuid, {
                    name: 'Finance',
                    warehouseConnection: postgresCredentials,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(await countConnections(fixture.projectUuid)).toBe(1);
        });
    });

    describe('adding an extra connection', () => {
        test('refuses a write before reading the primary credentials', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const readPrimary = vi.spyOn(
                ProjectModel.prototype,
                'getWarehouseCredentialsForProject',
            );
            const assertWrite = vi
                .spyOn(projectService, 'assertCanWriteWarehouseConnection')
                .mockImplementation(() => {
                    throw new ForbiddenError();
                });
            try {
                await expect(
                    buildService().create(fixture.admin, fixture.projectUuid, {
                        name: 'Finance',
                        warehouseConnection: postgresCredentials,
                    }),
                ).rejects.toBeInstanceOf(ForbiddenError);
                expect(assertWrite).toHaveBeenCalledOnce();
                expect(readPrimary).not.toHaveBeenCalled();
            } finally {
                readPrimary.mockRestore();
                assertWrite.mockRestore();
            }
        });

        test('creates it in a multi project and records the event', async () => {
            const fixture = await createProject({ mode: 'multi' });

            const created = await addExtra(fixture);

            expect(created).toMatchObject({
                name: 'Finance',
                isOriginal: false,
                warehouseType: WarehouseTypes.POSTGRES,
                organizationWarehouseCredentialsUuid: null,
            });
            expect(
                await database('project_connection_mode_events')
                    .where('project_uuid', fixture.projectUuid)
                    .select('event', 'plan'),
            ).toEqual([
                {
                    event: 'connection_added',
                    plan: {
                        warehouseConnectionUuid:
                            created.warehouseConnectionUuid,
                        name: 'Finance',
                        warehouseType: WarehouseTypes.POSTGRES,
                    },
                },
            ]);
            const stored = await model.getCredentials(
                await model.getProject(fixture.projectUuid),
                created.warehouseConnectionUuid,
            );
            expect(stored).toMatchObject(postgresCredentials);
        });

        test('refuses an extra connection of another warehouse type', async () => {
            const fixture = await createProject({ mode: 'multi' });

            await expect(
                buildService().create(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    { name: 'Lake', warehouseConnection: athenaCredentials },
                ),
            ).rejects.toThrow(
                'An extra connection must use the same warehouse type as the original connection.',
            );
            expect(await countConnections(fixture.projectUuid)).toBe(1);
        });

        test('refuses a project whose warehouse type cannot hold several connections', async () => {
            const fixture = await createProject({
                mode: 'multi',
                warehouseType: WarehouseTypes.REDSHIFT,
                credentials: {
                    ...postgresCredentials,
                    type: WarehouseTypes.REDSHIFT,
                } as CreateWarehouseCredentials,
            });

            await expect(
                buildService().create(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    {
                        name: 'Finance',
                        warehouseConnection: {
                            ...postgresCredentials,
                            type: WarehouseTypes.REDSHIFT,
                        } as CreateWarehouseCredentials,
                    },
                ),
            ).rejects.toEqual(new ForbiddenError(WAREHOUSE_TYPE_REASON));
        });

        test('refuses without the licence and without the rollout flag', async () => {
            const fixture = await createProject({ mode: 'multi' });

            await expect(
                buildService(false).create(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    {
                        name: 'Finance',
                        warehouseConnection: postgresCredentials,
                    },
                ),
            ).rejects.toEqual(new ForbiddenError(ENTITLEMENT_REASON));
            flag.enabled = false;
            await expect(addExtra(fixture)).rejects.toEqual(
                new ForbiddenError(ROLLOUT_REASON),
            );
            expect(await countConnections(fixture.projectUuid)).toBe(1);
        });

        test('reports why another connection cannot be added', async () => {
            const fixture = await createProject({ mode: 'multi' });
            flag.enabled = false;

            await expect(
                buildService().list(fixture.admin, fixture.projectUuid),
            ).resolves.toMatchObject({
                capabilities: {
                    canAddConnection: false,
                    reason: ROLLOUT_REASON,
                },
            });
        });

        test('refuses the connection when its test fails', async () => {
            const fixture = await createProject({ mode: 'multi' });
            testWarehouseConnectionCredentials.mockResolvedValue({
                ok: false,
                hops: [
                    {
                        stage: 'database',
                        status: 'failed',
                        message: 'password authentication failed',
                    },
                ],
            });

            await expect(addExtra(fixture)).rejects.toEqual(
                new ParameterError(
                    'Warehouse connection test failed: password authentication failed',
                ),
            );
            expect(await countConnections(fixture.projectUuid)).toBe(1);
        });
    });

    describe('B4 guards', () => {
        test('refuses an organisation credential without permission to view it, before loading it', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const organizationWarehouseCredentialsUuid =
                await createOrganizationCredential(fixture.organizationUuid);
            const loadOrganizationCredentials = vi.spyOn(
                model,
                'loadOrganizationCredentials',
            );

            await expect(
                buildService().create(fixture.admin, fixture.projectUuid, {
                    name: 'Shared',
                    organizationWarehouseCredentialsUuid,
                }),
            ).rejects.toEqual(
                new ForbiddenError(
                    'You do not have permission to use these organization warehouse credentials',
                ),
            );
            expect(loadOrganizationCredentials).not.toHaveBeenCalled();
            loadOrganizationCredentials.mockRestore();
            expect(await countConnections(fixture.projectUuid)).toBe(1);
        });

        test('refuses to update a connection that keeps an organisation credential without permission to view it', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const organizationWarehouseCredentialsUuid =
                await createOrganizationCredential(fixture.organizationUuid);
            const created = await buildService().create(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                { name: 'Shared', organizationWarehouseCredentialsUuid },
            );

            await expect(
                buildService().update(
                    fixture.admin,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                    { listAllDatabases: true },
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        test('uses an organisation credential with permission to view it', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const organizationWarehouseCredentialsUuid =
                await createOrganizationCredential(fixture.organizationUuid);

            await expect(
                buildService().create(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    { name: 'Shared', organizationWarehouseCredentialsUuid },
                ),
            ).resolves.toMatchObject({ organizationWarehouseCredentialsUuid });
        });

        test('refuses an organisation credential from another organisation', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'single' });
            const organizationWarehouseCredentialsUuid =
                await createOrganizationCredential(other.organizationUuid);

            await expect(
                buildService().create(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    { name: 'Shared', organizationWarehouseCredentialsUuid },
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
        });

        test('refuses every write on the analytics project', async () => {
            const fixture = await createProject({
                mode: 'multi',
                provisioningSource: 'analytics',
            });
            const service = buildService();
            const expected = new ForbiddenError(
                'Internal analytics configuration is managed by the backend',
            );

            await expect(
                service.create(fixture.credentialsAdmin, fixture.projectUuid, {
                    name: 'Finance',
                    warehouseConnection: postgresCredentials,
                }),
            ).rejects.toEqual(expected);
            await expect(
                service.rename(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    'Renamed',
                ),
            ).rejects.toEqual(expected);
            await expect(
                service.delete(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                ),
            ).rejects.toEqual(expected);
        });

        test('refuses Snowflake interactive authentication', async () => {
            const fixture = await createProject({ mode: 'multi' });

            await expect(
                buildService().create(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    {
                        name: 'Browser',
                        warehouseConnection: {
                            ...snowflakeCredentials,
                            authenticationType:
                                SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
                        },
                    },
                ),
            ).rejects.toEqual(
                new ParameterError(
                    'Snowflake OAuth authorization code authentication is only supported in the CLI and cannot be saved on a project',
                ),
            );
            expect(testWarehouseConnectionCredentials).not.toHaveBeenCalled();
        });

        test.each([
            ['blank', '   '],
            ['empty', ''],
            ['over-long', 'a'.repeat(101)],
        ])('refuses a %s name on create and rename', async (_label, name) => {
            const fixture = await createProject({ mode: 'multi' });
            const service = buildService();

            await expect(
                service.create(fixture.credentialsAdmin, fixture.projectUuid, {
                    name,
                    warehouseConnection: postgresCredentials,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            await expect(
                service.rename(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    name,
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(
                await database('warehouse_connections')
                    .where('project_uuid', fixture.projectUuid)
                    .pluck('name'),
            ).toEqual(['Original']);
        });

        test('trims names and refuses a duplicate with the field message', async () => {
            const fixture = await createProject({ mode: 'multi' });
            await addExtra(fixture, '  Finance  ');

            expect(
                await database('warehouse_connections')
                    .where('project_uuid', fixture.projectUuid)
                    .orderBy('name')
                    .pluck('name'),
            ).toEqual(['Finance', 'Original']);
            await expect(addExtra(fixture, 'Finance')).rejects.toEqual(
                new ConflictError(WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE),
            );
            await expect(
                buildService().rename(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    'Finance',
                ),
            ).rejects.toEqual(
                new ConflictError(WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE),
            );
        });
    });

    describe('the original connection', () => {
        test('can be renamed and given listing settings, but its credentials are edited in the project settings', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const service = buildService();

            await expect(
                service.rename(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    'Warehouse',
                ),
            ).resolves.toMatchObject({
                name: 'Warehouse',
                isOriginal: true,
                warehouseType: WarehouseTypes.POSTGRES,
            });
            await expect(
                service.update(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    { additionalDatabases: ['finance'] },
                ),
            ).resolves.toMatchObject({ additionalDatabases: ['finance'] });
            await expect(
                service.update(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    { warehouseConnection: postgresCredentials },
                ),
            ).rejects.toEqual(
                new ParameterError(
                    'Edit the original connection in the project settings.',
                ),
            );
            await expect(
                service.get(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                ),
            ).resolves.toMatchObject({ warehouseConnection: null });
        });

        test('cannot be deleted', async () => {
            const fixture = await createProject({ mode: 'multi' });
            await addExtra(fixture);

            await expect(
                buildService().delete(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                ),
            ).rejects.toEqual(
                new ConflictError('The original connection cannot be removed.'),
            );
            expect(await countConnections(fixture.projectUuid)).toBe(2);
        });
    });

    describe('updating an extra connection', () => {
        test('keeps an omitted secret for the same destination and never returns it', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const service = buildService();

            await service.update(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                {
                    warehouseConnection: {
                        ...postgresCredentials,
                        schema: 'finance',
                        password: undefined,
                    },
                },
            );

            expect(
                await model.getCredentials(
                    await model.getProject(fixture.projectUuid),
                    created.warehouseConnectionUuid,
                ),
            ).toMatchObject({
                schema: 'finance',
                password: 'analyst-password',
            });
            const fetched = await service.get(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
            );
            expect(fetched.warehouseConnection).toMatchObject({
                schema: 'finance',
            });
            expect(fetched.warehouseConnection).not.toHaveProperty('password');
            expect(fetched.warehouseConnection).not.toHaveProperty('user');
        });

        test('does not send a saved secret to a new host', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);

            await buildService().update(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                {
                    warehouseConnection: {
                        ...postgresCredentials,
                        host: 'elsewhere.internal',
                        password: undefined,
                    },
                },
            );

            expect(
                await model.getCredentials(
                    await model.getProject(fixture.projectUuid),
                    created.warehouseConnectionUuid,
                ),
            ).toMatchObject({ host: 'elsewhere.internal', password: '' });
        });

        test('never copies an organisation credential secret into the connection when it moves to its own credentials', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const organizationCredential = await createOrganizationCredential(
                fixture.organizationUuid,
                {
                    ...postgresCredentials,
                    user: 'org-user',
                    password: 'org-secret-password',
                },
            );
            const service = buildService();
            const created = await service.create(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                {
                    name: 'Shared',
                    organizationWarehouseCredentialsUuid:
                        organizationCredential,
                },
            );
            testWarehouseConnectionCredentials.mockClear();

            await service.update(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                {
                    warehouseConnection: {
                        ...postgresCredentials,
                        user: undefined,
                        password: undefined,
                    },
                },
            );

            const row = await database('warehouse_connections')
                .where(
                    'warehouse_connection_uuid',
                    created.warehouseConnectionUuid,
                )
                .first();
            const stored = encryptionUtil.decrypt(row.encrypted_credentials);
            expect(stored).not.toContain('org-secret-password');
            expect(stored).not.toContain('org-user');
            expect(row.organization_warehouse_credentials_uuid).toBeNull();
            expect(
                testWarehouseConnectionCredentials.mock.calls[0][2].password,
            ).toBe('');
        });

        test('refuses a change to another warehouse type', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);

            await expect(
                buildService().update(
                    fixture.credentialsAdmin,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                    { warehouseConnection: athenaCredentials },
                ),
            ).rejects.toThrow(
                'An extra connection must use the same warehouse type as the original connection.',
            );
        });
    });

    describe('removing an extra connection', () => {
        const bindAll = async (
            fixture: Fixture,
            warehouseConnectionUuid: string,
        ) => {
            await database('cached_explore').insert({
                project_uuid: fixture.projectUuid,
                name: 'orders',
                table_names: [],
                explore: {},
                warehouse_connection_uuid: warehouseConnectionUuid,
            } as never);
            await database('project_dbt_sources').insert({
                project_uuid: fixture.projectUuid,
                name: 'finance_source',
                warehouse_connection_uuid: warehouseConnectionUuid,
            } as never);
            const [savedSql] = await database('saved_sql')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Revenue',
                    slug: `revenue-${randomUUID()}`,
                } as never)
                .returning('saved_sql_uuid');
            await database('saved_sql_versions').insert({
                saved_sql_uuid: savedSql.saved_sql_uuid,
                sql: 'select 1',
                warehouse_connection_uuid: warehouseConnectionUuid,
            } as never);
            await database('query_history').insert({
                organization_uuid: fixture.organizationUuid,
                project_uuid: fixture.projectUuid,
                context: 'test',
                compiled_sql: 'select 1',
                metric_query: {},
                fields: {},
                request_parameters: {},
                cache_key: randomUUID(),
                status: 'executing',
                warehouse_connection_uuid: warehouseConnectionUuid,
            } as never);
        };

        test('is refused with a list of what is bound, and nothing changes', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            await bindAll(fixture, created.warehouseConnectionUuid);

            await expect(
                buildService().delete(
                    fixture.admin,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).rejects.toEqual(
                new ConflictError(
                    "Connection 'Finance' cannot be removed while content uses it. explores: orders; dbt sources: finance_source; SQL charts: Revenue; in-flight queries: 1.",
                ),
            );
            expect(await countConnections(fixture.projectUuid)).toBe(2);
        });

        test('counts only the latest version of a SQL chart, clears older versions and records the name', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const [savedSql] = await database('saved_sql')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Revenue',
                    slug: `revenue-${randomUUID()}`,
                } as never)
                .returning('saved_sql_uuid');
            const [olderVersion] = await database('saved_sql_versions')
                .insert({
                    saved_sql_uuid: savedSql.saved_sql_uuid,
                    sql: 'select 1',
                    created_at: new Date('2026-01-01T00:00:00Z'),
                    warehouse_connection_uuid: created.warehouseConnectionUuid,
                } as never)
                .returning('saved_sql_version_uuid');
            await database('saved_sql_versions').insert({
                saved_sql_uuid: savedSql.saved_sql_uuid,
                sql: 'select 2',
                created_at: new Date('2026-02-01T00:00:00Z'),
            } as never);

            await buildService().delete(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
            );

            expect(await countConnections(fixture.projectUuid)).toBe(1);
            expect(
                await database('saved_sql_versions')
                    .where(
                        'saved_sql_version_uuid',
                        olderVersion.saved_sql_version_uuid,
                    )
                    .first('warehouse_connection_uuid'),
            ).toEqual({ warehouse_connection_uuid: null });
            expect(
                await database('project_connection_mode_events')
                    .where('project_uuid', fixture.projectUuid)
                    .where('event', 'connection_removed')
                    .first('plan'),
            ).toEqual({
                plan: {
                    warehouseConnectionUuid: created.warehouseConnectionUuid,
                    name: 'Finance',
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            });
        });

        const newChart = async (fixture: Fixture, deleted = false) =>
            (
                await database('saved_sql')
                    .insert({
                        project_uuid: fixture.projectUuid,
                        name: `Chart ${randomUUID().slice(0, 6)}`,
                        slug: `chart-${randomUUID()}`,
                        deleted_at: deleted ? new Date() : null,
                    } as never)
                    .returning(['saved_sql_uuid', 'name'])
            )[0] as { saved_sql_uuid: string; name: string };

        const newVersion = async (
            savedSqlUuid: string,
            createdAt: string,
            warehouseConnectionUuid: string | null,
        ) =>
            (
                await database('saved_sql_versions')
                    .insert({
                        saved_sql_uuid: savedSqlUuid,
                        sql: 'select 1',
                        created_at: new Date(createdAt),
                        warehouse_connection_uuid: warehouseConnectionUuid,
                    } as never)
                    .returning('saved_sql_version_uuid')
            )[0].saved_sql_version_uuid as string;

        test('names a soft-deleted chart whose latest version is bound', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const chart = await newChart(fixture, true);
            await newVersion(
                chart.saved_sql_uuid,
                '2026-01-01T00:00:00Z',
                created.warehouseConnectionUuid,
            );

            await expect(
                buildService().delete(
                    fixture.admin,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).rejects.toThrow(`SQL charts: ${chart.name} (deleted)`);
        });

        test('a completed query does not block removal, and older versions of another connection keep their binding', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const other = await addExtra(fixture, 'Marketing');
            const chart = await newChart(fixture);
            const olderOther = await newVersion(
                chart.saved_sql_uuid,
                '2026-01-01T00:00:00Z',
                other.warehouseConnectionUuid,
            );
            const olderMine = await newVersion(
                chart.saved_sql_uuid,
                '2026-01-02T00:00:00Z',
                created.warehouseConnectionUuid,
            );
            await newVersion(
                chart.saved_sql_uuid,
                '2026-01-03T00:00:00Z',
                null,
            );
            await database('query_history').insert({
                organization_uuid: fixture.organizationUuid,
                project_uuid: fixture.projectUuid,
                context: 'test',
                compiled_sql: 'select 1',
                metric_query: {},
                fields: {},
                request_parameters: {},
                cache_key: randomUUID(),
                status: 'ready',
                warehouse_connection_uuid: created.warehouseConnectionUuid,
            } as never);

            await buildService().delete(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
            );

            const bindings = Object.fromEntries(
                (
                    await database('saved_sql_versions')
                        .whereIn('saved_sql_version_uuid', [
                            olderOther,
                            olderMine,
                        ])
                        .select(
                            'saved_sql_version_uuid',
                            'warehouse_connection_uuid',
                        )
                ).map((row) => [
                    row.saved_sql_version_uuid,
                    row.warehouse_connection_uuid,
                ]),
            );
            expect(bindings).toEqual({
                [olderOther]: other.warehouseConnectionUuid,
                [olderMine]: null,
            });
        });

        test('a binding committed during the removal gives the content conflict, and the connection stays', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const chart = await newChart(fixture);
            vi.spyOn(
                WarehouseConnectionModel.prototype,
                'clearOlderSqlChartVersionBindings',
            ).mockImplementationOnce(async () => {
                await newVersion(
                    chart.saved_sql_uuid,
                    '2026-01-01T00:00:00Z',
                    created.warehouseConnectionUuid,
                );
                return 0;
            });

            await expect(
                buildService().delete(
                    fixture.admin,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).rejects.toEqual(
                new ConflictError(
                    "Connection 'Finance' cannot be removed while content uses it.",
                ),
            );
            expect(await countConnections(fixture.projectUuid)).toBe(2);
        });

        test('keeps working with the rollout flag off', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            flag.enabled = false;

            await buildService().delete(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
            );

            expect(await countConnections(fixture.projectUuid)).toBe(1);
        });
    });

    describe('tenancy', () => {
        test('assertBindingsBelongToProject refuses another project connection', async () => {
            const owner = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'multi' });
            const ownerConnection = await addExtra(owner);
            const service = buildService();

            await expect(
                service.assertBindingsBelongToProject(other.projectUuid, [
                    ownerConnection.warehouseConnectionUuid,
                ]),
            ).rejects.toBeInstanceOf(ParameterError);
            await expect(
                service.assertBindingsBelongToProject(owner.projectUuid, [
                    ownerConnection.warehouseConnectionUuid,
                    null,
                ]),
            ).resolves.toBeUndefined();
        });

        test('never reads another project connection', async () => {
            const owner = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'multi' });
            const ownerConnection = await addExtra(owner);

            await expect(
                buildService().get(
                    other.admin,
                    other.projectUuid,
                    ownerConnection.warehouseConnectionUuid,
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe('the real connection test', () => {
        const liveCredentials = (password: string) =>
            ({
                type: WarehouseTypes.POSTGRES,
                host: process.env.PGHOST ?? '127.0.0.1',
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER ?? 'postgres',
                password,
                dbname: 'postgres',
                schema: 'public',
                sslmode: 'disable',
            }) as CreatePostgresCredentials;

        test('passes with working credentials and fails with a wrong password', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const policy = new ProjectService({
                lightdashConfig: lightdashConfigMock,
                projectModel: new ProjectModel({
                    database,
                    lightdashConfig: lightdashConfigMock,
                    encryptionUtil,
                }),
            } as never);

            const working = await policy.testWarehouseConnectionCredentials(
                fixture.admin as never,
                fixture.organizationUuid,
                liveCredentials(process.env.PGPASSWORD ?? ''),
            );
            const wrong = await policy.testWarehouseConnectionCredentials(
                fixture.admin as never,
                fixture.organizationUuid,
                liveCredentials('not-the-password'),
            );

            expect(working).toEqual({
                ok: true,
                hops: [{ stage: 'database', status: 'ok', message: null }],
            });
            expect(wrong.ok).toBe(false);
            expect(wrong.hops).toEqual([
                expect.objectContaining({
                    stage: 'database',
                    status: 'failed',
                    message: expect.stringContaining(
                        'password authentication failed',
                    ),
                }),
            ]);
        });
    });

    describe('personal credential preference per connection', () => {
        const createPersonal = async (
            userUuid: string,
            credentials: Record<string, unknown>,
            projectUuid: string | null = null,
        ) =>
            (
                await database('user_warehouse_credentials')
                    .insert({
                        user_uuid: userUuid,
                        name: `Personal ${randomUUID()}`,
                        warehouse_type: credentials.type,
                        encrypted_credentials: encryptionUtil.encrypt(
                            JSON.stringify(credentials),
                        ),
                        project_uuid: projectUuid,
                    } as never)
                    .returning('user_warehouse_credentials_uuid')
            )[0].user_warehouse_credentials_uuid as string;

        const personalPostgres = {
            type: WarehouseTypes.POSTGRES,
            user: 'personal-user',
            password: 'personal-password',
        };

        test('is refused on a single project', async () => {
            const fixture = await createProject({ mode: 'single' });
            const personal = await createPersonal(
                fixture.userUuid,
                personalPostgres,
            );
            const service = buildService();

            await expect(
                service.getUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                    randomUUID(),
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
            await expect(
                service.upsertUserCredentialsPreference(
                    fixture.viewer,
                    fixture.projectUuid,
                    randomUUID(),
                    personal,
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
        });

        test('is refused for the original connection', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const personal = await createPersonal(
                fixture.userUuid,
                personalPostgres,
            );

            await expect(
                buildService().upsertUserCredentialsPreference(
                    fixture.viewer,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    personal,
                ),
            ).rejects.toBeInstanceOf(ParameterError);
        });

        test('a project viewer saves and reads a choice, and the original requirement applies', async () => {
            const fixture = await createProject({
                mode: 'multi',
                credentials: {
                    ...postgresCredentials,
                    requireUserCredentials: true,
                },
            });
            const created = await addExtra(fixture);
            const personal = await createPersonal(
                fixture.userUuid,
                personalPostgres,
            );
            const service = buildService();

            expect(
                await service.getUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).toEqual({
                warehouseConnectionUuid: created.warehouseConnectionUuid,
                warehouseType: WarehouseTypes.POSTGRES,
                requireUserCredentials: true,
                allowsOptionalUserCredentials: false,
                userWarehouseCredentials: null,
            });
            await service.upsertUserCredentialsPreference(
                fixture.viewer,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                personal,
            );
            expect(
                await service.getUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).toMatchObject({
                userWarehouseCredentials: { uuid: personal },
            });
            expect(
                await database('project_user_warehouse_credentials_preference')
                    .where('project_uuid', fixture.projectUuid)
                    .select('user_uuid'),
            ).toEqual([]);
        });

        test('refuses a credential of another user, another type or another project', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const other = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const service = buildService();
            const attempts = [
                {
                    credential: await createPersonal(
                        other.userUuid,
                        personalPostgres,
                    ),
                    error: ForbiddenError,
                },
                {
                    credential: await createPersonal(fixture.userUuid, {
                        type: WarehouseTypes.SNOWFLAKE,
                        user: 'personal-user',
                        password: 'personal-password',
                    }),
                    error: ParameterError,
                },
                {
                    credential: await createPersonal(
                        fixture.userUuid,
                        personalPostgres,
                        other.projectUuid,
                    ),
                    error: ParameterError,
                },
            ];

            await Promise.all(
                attempts.map(({ credential, error }) =>
                    expect(
                        service.upsertUserCredentialsPreference(
                            fixture.viewer,
                            fixture.projectUuid,
                            created.warehouseConnectionUuid,
                            credential,
                        ),
                    ).rejects.toBeInstanceOf(error),
                ),
            );
            expect(
                await database(
                    'warehouse_connection_user_credentials_preference',
                ).where(
                    'warehouse_connection_uuid',
                    created.warehouseConnectionUuid,
                ),
            ).toEqual([]);
        });

        test('requires permission to view the project', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const outsider = account(
                fixture.userUuid,
                fixture.organizationUuid,
                [],
            );

            await expect(
                buildService().getUserCredentials(
                    outsider,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        test('the per-connection GET returns no secret from the chosen credential', async () => {
            const fixture = await createProject({
                mode: 'multi',
                credentials: {
                    ...postgresCredentials,
                    requireUserCredentials: true,
                },
            });
            const created = await addExtra(fixture);
            const personal = await createPersonal(
                fixture.userUuid,
                personalPostgres,
            );
            const service = buildService();
            await service.upsertUserCredentialsPreference(
                fixture.viewer,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                personal,
            );

            const result = await service.getUserCredentials(
                fixture.viewer,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
            );

            expect(result.userWarehouseCredentials).toMatchObject({
                uuid: personal,
                credentials: {
                    type: WarehouseTypes.POSTGRES,
                    user: 'personal-user',
                },
            });
            expect(JSON.stringify(result)).not.toContain('personal-password');
            expect(JSON.stringify(result)).not.toContain('analyst-password');
        });

        test('a second choice for the same connection replaces the first', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await addExtra(fixture);
            const first = await createPersonal(
                fixture.userUuid,
                personalPostgres,
            );
            const second = await createPersonal(
                fixture.userUuid,
                personalPostgres,
            );
            const service = buildService();

            await service.upsertUserCredentialsPreference(
                fixture.viewer,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                first,
            );
            await service.upsertUserCredentialsPreference(
                fixture.viewer,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                second,
            );

            expect(
                await service.getUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                    created.warehouseConnectionUuid,
                ),
            ).toMatchObject({ userWarehouseCredentials: { uuid: second } });
            expect(
                await database(
                    'warehouse_connection_user_credentials_preference',
                )
                    .where(
                        'warehouse_connection_uuid',
                        created.warehouseConnectionUuid,
                    )
                    .select('user_warehouse_credentials_uuid'),
            ).toEqual([{ user_warehouse_credentials_uuid: second }]);
        });
    });

    describe('connections for the credentials switcher', () => {
        test('project extras store the primary credential requirement on create and update', async () => {
            const fixture = await createProject({
                mode: 'multi',
                credentials: {
                    ...postgresCredentials,
                    requireUserCredentials: true,
                },
            });
            const service = buildService();
            const created = await service.create(
                fixture.admin,
                fixture.projectUuid,
                {
                    name: 'Finance',
                    warehouseConnection: {
                        ...postgresCredentials,
                        requireUserCredentials: false,
                    },
                },
            );
            expect(
                (
                    await model.getCredentials(
                        await model.getProject(fixture.projectUuid),
                        created.warehouseConnectionUuid,
                    )
                ).requireUserCredentials,
            ).toBe(true);
            await service.update(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
                {
                    warehouseConnection: {
                        ...postgresCredentials,
                        requireUserCredentials: false,
                    },
                },
            );
            expect(
                (
                    await model.getCredentials(
                        await model.getProject(fixture.projectUuid),
                        created.warehouseConnectionUuid,
                    )
                ).requireUserCredentials,
            ).toBe(true);
        });

        test('GET reports the effective requirement after the primary changes', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const created = await buildService().create(
                fixture.admin,
                fixture.projectUuid,
                {
                    name: 'Finance',
                    warehouseConnection: postgresCredentials,
                },
            );
            await database('warehouse_credentials')
                .whereIn(
                    'project_id',
                    database('projects')
                        .select('project_id')
                        .where('project_uuid', fixture.projectUuid),
                )
                .update({
                    encrypted_credentials: encryptionUtil.encrypt(
                        JSON.stringify({
                            ...postgresCredentials,
                            requireUserCredentials: true,
                        }),
                    ),
                } as never);
            const got = await buildService().get(
                fixture.admin,
                fixture.projectUuid,
                created.warehouseConnectionUuid,
            );
            const forUser = (
                await buildService().listForUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                )
            ).find(
                (connection) =>
                    connection.warehouseConnectionUuid ===
                    created.warehouseConnectionUuid,
            );
            expect({
                getReports: got.warehouseConnection?.requireUserCredentials,
                effective: forUser?.requireUserCredentials,
            }).toEqual({ getReports: true, effective: true });
        });

        test('organisation credential extras keep their own credential requirement', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const organizationCredential = await createOrganizationCredential(
                fixture.organizationUuid,
                { ...postgresCredentials, requireUserCredentials: true },
            );
            const shared = await buildService().create(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                {
                    name: 'Shared',
                    organizationWarehouseCredentialsUuid:
                        organizationCredential,
                },
            );
            expect(
                await buildService().listForUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                ),
            ).toContainEqual(
                expect.objectContaining({
                    warehouseConnectionUuid: shared.warehouseConnectionUuid,
                    requireUserCredentials: true,
                }),
            );
        });

        test('a project viewer lists every connection with its type and requirement, and no secret', async () => {
            const fixture = await createProject({
                mode: 'multi',
                credentials: {
                    ...postgresCredentials,
                    requireUserCredentials: true,
                },
            });
            const finance = await addExtra(fixture, 'Finance');
            const organizationCredential = await createOrganizationCredential(
                fixture.organizationUuid,
            );
            const shared = await buildService().create(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                {
                    name: 'Shared',
                    organizationWarehouseCredentialsUuid:
                        organizationCredential,
                },
            );

            const connections = await buildService().listForUserCredentials(
                fixture.viewer,
                fixture.projectUuid,
            );

            expect(connections).toEqual([
                {
                    warehouseConnectionUuid: fixture.originalUuid,
                    name: 'Original',
                    isOriginal: true,
                    warehouseType: WarehouseTypes.POSTGRES,
                    requireUserCredentials: true,
                },
                {
                    warehouseConnectionUuid: finance.warehouseConnectionUuid,
                    name: 'Finance',
                    isOriginal: false,
                    warehouseType: WarehouseTypes.POSTGRES,
                    requireUserCredentials: true,
                },
                {
                    warehouseConnectionUuid: shared.warehouseConnectionUuid,
                    name: 'Shared',
                    isOriginal: false,
                    warehouseType: WarehouseTypes.POSTGRES,
                    requireUserCredentials: true,
                },
            ]);
            expect(JSON.stringify(connections)).not.toContain(
                'analyst-password',
            );
            expect(JSON.stringify(connections)).not.toContain(
                organizationCredential,
            );
        });

        test('an extra connection does not require personal credentials when the original does not', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const finance = await addExtra(fixture, 'Finance');

            expect(
                await buildService().listForUserCredentials(
                    fixture.viewer,
                    fixture.projectUuid,
                ),
            ).toEqual([
                expect.objectContaining({
                    isOriginal: true,
                    requireUserCredentials: false,
                }),
                expect.objectContaining({
                    warehouseConnectionUuid: finance.warehouseConnectionUuid,
                    requireUserCredentials: false,
                }),
            ]);
        });

        test('is refused on a single project and without permission to view the project', async () => {
            const single = await createProject({ mode: 'single' });
            const multi = await createProject({ mode: 'multi' });
            await addExtra(multi);
            const outsider = account(
                multi.userUuid,
                multi.organizationUuid,
                [],
            );

            await expect(
                buildService().listForUserCredentials(
                    single.viewer,
                    single.projectUuid,
                ),
            ).rejects.toBeInstanceOf(SingleConnectionProjectError);
            await expect(
                buildService().listForUserCredentials(
                    outsider,
                    multi.projectUuid,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('the project row lock', () => {
        test('does not block unrelated inserts that reference the project', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const holder = await database.transaction();
            await new WarehouseConnectionModel({
                database: holder,
                encryptionUtil,
                organizationWarehouseCredentialsModel: {} as never,
            }).lockProject(fixture.projectUuid);
            const other = await database.transaction();
            await other.raw(`SET LOCAL lock_timeout = '1s'`);

            const outcome = await other('cached_explore')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'unrelated',
                    table_names: [],
                    explore: {},
                } as never)
                .then(
                    () => 'inserted',
                    (error: { code?: string }) => `blocked: ${error.code}`,
                );
            await other.rollback();
            await holder.rollback();

            expect(outcome).toBe('inserted');
        });

        test('a write waits for another transaction that holds the project row', async () => {
            const fixture = await createProject({ mode: 'multi' });
            const holder = await database.transaction();
            await holder.raw(
                'SELECT 1 FROM projects WHERE project_uuid = ? FOR UPDATE',
                [fixture.projectUuid],
            );
            let settled = false;

            const rename = buildService()
                .rename(
                    fixture.admin,
                    fixture.projectUuid,
                    fixture.originalUuid!,
                    'Locked',
                )
                .then(() => {
                    settled = true;
                });
            await new Promise((resolve) => {
                setTimeout(resolve, 750);
            });
            const settledWhileLocked = settled;
            await holder.commit();
            await rename;

            expect(settledWhileLocked).toBe(false);
            expect(settled).toBe(true);
        });
    });
});
