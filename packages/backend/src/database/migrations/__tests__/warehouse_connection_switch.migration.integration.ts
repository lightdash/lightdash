import { Ability } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    ProjectType,
    SnowflakeAuthenticationType,
    WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE,
    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
    WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
    WarehouseTypes,
    type ApiWarehouseConnectionSwitchRequest,
    type CreatePostgresCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type Explore,
    type PossibleAbilities,
    type SessionAccount,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EnterpriseLicenseService } from '../../../ee/services/LicenseService/LicenseService';
import { logAuditEvent } from '../../../logging/winston';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { WarehouseConnectionRouter } from '../../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { WarehouseConnectionSwitchModel } from '../../../models/WarehouseConnectionSwitchModel/WarehouseConnectionSwitchModel';
import { rescueWarehouseConnection } from '../../../scripts/rescue-warehouse-connection/rescue';
import { LicenseService } from '../../../services/LicenseService/LicenseService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    ENTITLEMENT_REASON,
    ROLLOUT_REASON,
    WAREHOUSE_TYPE_REASON,
    WarehouseConnectionService,
} from '../../../services/WarehouseConnectionService/WarehouseConnectionService';
import {
    DEFAULT_PROJECT_ONLY_REASON,
    ORIGINAL_ORGANIZATION_CREDENTIALS_REASON,
    WarehouseConnectionSwitchService,
} from '../../../services/WarehouseConnectionSwitchService/WarehouseConnectionSwitchService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

vi.mock('../../../logging/winston', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../logging/winston')>()),
    logAuditEvent: vi.fn(),
}));

const SECRET = 'warehouse-connection-switch-test-secret';

const postgresCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    user: 'analyst',
    password: 'analyst-password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const financeCredentials: CreatePostgresCredentials = {
    ...postgresCredentials,
    host: 'finance.internal',
    dbname: 'finance',
};

const snowflakeCredentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'user',
    password: 'password',
    database: 'analytics',
    warehouse: 'compute',
    schema: 'public',
    authenticationType: SnowflakeAuthenticationType.PASSWORD,
};

const switchRequest = (
    overrides: Partial<ApiWarehouseConnectionSwitchRequest> = {},
): ApiWarehouseConnectionSwitchRequest => ({
    original: {
        name: 'Main warehouse',
        listAllDatabases: false,
        additionalDatabases: ['archive'],
    },
    connection: { name: 'Finance', warehouseConnection: financeCredentials },
    ...overrides,
});

type Fixture = {
    organizationUuid: string;
    projectUuid: string;
    projectId: number;
    userUuid: string;
    admin: SessionAccount;
    credentialsAdmin: SessionAccount;
    viewer: SessionAccount;
};

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
                database: 'analytics',
                schema: 'public',
                sqlTable: `"analytics"."public"."${name}"`,
                dimensions: {},
                metrics: {},
                lineageGraph: {},
            },
        },
        targetDatabase: 'postgres',
    }) as unknown as Explore;

describe('Enable multiple connections on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let encryptionUtil: EncryptionUtil;
    let organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
    let projectModel: ProjectModel;
    let switchModel: WarehouseConnectionSwitchModel;
    let connectionModel: WarehouseConnectionModel;
    let projectService: ProjectService;
    const flag = { enabled: true };
    const testWarehouseConnectionCredentials = vi.fn();
    const analytics = { track: vi.fn() };

    const featureFlagService = () => ({
        get: vi.fn(async () => ({
            id: FeatureFlags.MultiConnectionProjects,
            enabled: flag.enabled,
        })),
    });

    const credentialPolicy = () => ({
        assertCanWriteWarehouseConnection: (
            ...args: Parameters<
                ProjectService['assertCanWriteWarehouseConnection']
            >
        ) => projectService.assertCanWriteWarehouseConnection(...args),
        testWarehouseConnectionCredentials,
    });

    const buildService = (licensed = true) =>
        new WarehouseConnectionSwitchService({
            warehouseConnectionSwitchModel: switchModel,
            warehouseConnectionModel: connectionModel,
            projectModel,
            featureFlagService: featureFlagService(),
            licenseService: licensed
                ? new EnterpriseLicenseService({ licenseKey: 'licence' })
                : new LicenseService({ licenseKey: null }),
            credentialPolicy: credentialPolicy(),
            analytics,
        });

    const buildConnectionService = () =>
        new WarehouseConnectionService({
            warehouseConnectionModel: connectionModel,
            projectModel,
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
            featureFlagService: featureFlagService(),
            licenseService: new EnterpriseLicenseService({
                licenseKey: 'licence',
            }),
            credentialPolicy: credentialPolicy(),
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

    const encrypt = (credentials: CreateWarehouseCredentials) =>
        encryptionUtil.encrypt(JSON.stringify(credentials));

    const createProject = async ({
        mode = 'single',
        type = ProjectType.DEFAULT,
        provisioningSource = null,
        credentials = postgresCredentials,
        withCredentials = true,
    }: {
        mode?: 'single' | 'multi';
        type?: ProjectType;
        provisioningSource?: string | null;
        credentials?: CreateWarehouseCredentials;
        withCredentials?: boolean;
    } = {}): Promise<Fixture> => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Switch test' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'Admin' } as never)
            .returning('user_uuid');
        const [project] = await database('projects')
            .insert({
                name: 'Switch project',
                organization_id: organization.organization_id,
                connection_mode: mode,
                project_type: type,
                provisioning_source: provisioningSource,
            } as never)
            .returning(['project_id', 'project_uuid']);
        if (withCredentials) {
            await database('warehouse_credentials').insert({
                project_id: project.project_id,
                warehouse_type: credentials.type,
                encrypted_credentials: encrypt(credentials),
            } as never);
        }
        return {
            organizationUuid: organization.organization_uuid,
            projectUuid: project.project_uuid,
            projectId: project.project_id,
            userUuid: user.user_uuid,
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
        credentials: CreateWarehouseCredentials = financeCredentials,
    ) =>
        (
            await database('organization_warehouse_credentials')
                .insert({
                    organization_uuid: organizationUuid,
                    name: `Shared ${randomUUID()}`,
                    warehouse_type: credentials.type,
                    warehouse_connection: encrypt(credentials),
                } as never)
                .returning('organization_warehouse_credentials_uuid')
        )[0].organization_warehouse_credentials_uuid as string;

    const state = async (projectUuid: string) => ({
        mode: (
            await database('projects')
                .where('project_uuid', projectUuid)
                .first('connection_mode')
        ).connection_mode as string,
        connections: await database('warehouse_connections')
            .where('project_uuid', projectUuid)
            .orderBy('is_original', 'desc')
            .select(
                'name',
                'is_original',
                'warehouse_type',
                'list_all_databases',
                'additional_databases',
            ),
        events: await database('project_connection_mode_events')
            .where('project_uuid', projectUuid)
            .orderBy('created_at')
            .select('event', 'plan', 'plan_hash', 'idempotency_key'),
    });

    const singleState = {
        mode: 'single',
        connections: [],
        events: [],
    };

    const switchProject = async (
        fixture: Fixture,
        request: ApiWarehouseConnectionSwitchRequest = switchRequest(),
        idempotencyKey: string = randomUUID(),
    ) => {
        const service = buildService();
        const plan = await service.preview(
            fixture.admin,
            fixture.projectUuid,
            request,
        );
        return {
            plan,
            result: await service.execute(fixture.admin, fixture.projectUuid, {
                ...request,
                planHash: plan.planHash,
                idempotencyKey,
            }),
        };
    };

    const route = (projectUuid: string) =>
        new WarehouseConnectionRouter({ database }).getRoute(projectUuid);

    const waitForLockWait = async () => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            const [row] = await database('pg_stat_activity')
                .where('wait_event_type', 'Lock')
                .where('datname', database.raw('current_database()'))
                .count<{ count: string }[]>({ count: '*' });
            if (Number(row.count) > 0) return;
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });
        }
        throw new Error('No transaction waited for a lock');
    };

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase(
            'warehouse_connection_switch',
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
        organizationWarehouseCredentialsModel =
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
        projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
        });
        switchModel = new WarehouseConnectionSwitchModel({
            database,
            encryptionUtil,
            organizationWarehouseCredentialsModel,
        });
        connectionModel = new WarehouseConnectionModel({
            database,
            encryptionUtil,
            organizationWarehouseCredentialsModel,
        });
        projectService = new ProjectService({} as never);
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        flag.enabled = true;
        analytics.track.mockReset();
        vi.mocked(logAuditEvent).mockReset();
        testWarehouseConnectionCredentials.mockReset();
        testWarehouseConnectionCredentials.mockResolvedValue({
            ok: true,
            hops: [{ stage: 'database', status: 'ok', message: null }],
        });
    });

    describe('the dry run and the switch', () => {
        test('the switch does what the dry run planned, and the project routes multi', async () => {
            const fixture = await createProject();
            await database('saved_sql').insert({
                project_uuid: fixture.projectUuid,
                name: 'Revenue',
                slug: `revenue-${randomUUID()}`,
                created_by_user_uuid: fixture.userUuid,
            } as never);

            const { plan, result } = await switchProject(fixture);

            expect(plan).toEqual({
                planHash: expect.any(String),
                original: {
                    name: 'Main warehouse',
                    warehouseType: WarehouseTypes.POSTGRES,
                    listAllDatabases: false,
                    additionalDatabases: ['archive'],
                },
                connection: {
                    name: 'Finance',
                    warehouseType: WarehouseTypes.POSTGRES,
                    database: 'finance',
                    usesOrganizationCredentials: false,
                },
                staysOnOriginal: {
                    explores: 0,
                    sqlCharts: 1,
                    sqlChartVersions: 0,
                    dbtSources: 1,
                    scheduledDeliveries: 0,
                    dashboards: 0,
                },
                personalCredentials: {
                    usersWithPersonalCredentials: 0,
                    requireUserCredentials: false,
                },
            });
            expect(await state(fixture.projectUuid)).toEqual({
                mode: 'multi',
                connections: [
                    {
                        name: 'Main warehouse',
                        is_original: true,
                        warehouse_type: null,
                        list_all_databases: false,
                        additional_databases: ['archive'],
                    },
                    {
                        name: 'Finance',
                        is_original: false,
                        warehouse_type: WarehouseTypes.POSTGRES,
                        list_all_databases: false,
                        additional_databases: [],
                    },
                ],
                events: [
                    {
                        event: 'switched_to_multi',
                        plan: {
                            ...plan,
                            switched: {
                                originalWarehouseConnectionUuid:
                                    result.originalWarehouseConnectionUuid,
                                warehouseConnectionUuid:
                                    result.warehouseConnectionUuid,
                            },
                        },
                        plan_hash: plan.planHash,
                        idempotency_key: expect.any(String),
                    },
                ],
            });
            expect(result.eventUuid).toEqual(expect.any(String));
            expect(await route(fixture.projectUuid)).toBe('multi');
            expect(
                await connectionModel.getCredentials(
                    await connectionModel.getProject(fixture.projectUuid),
                    result.warehouseConnectionUuid,
                ),
            ).toEqual(financeCredentials);
        });

        test('the switch never writes the original warehouse credentials', async () => {
            const fixture = await createProject();
            const before = await database('warehouse_credentials')
                .where('project_id', fixture.projectId)
                .first();

            await switchProject(fixture);

            expect(
                await database('warehouse_credentials')
                    .where('project_id', fixture.projectId)
                    .first(),
            ).toEqual(before);
        });

        test('a switch with a plan hash that does not match aborts and writes nothing', async () => {
            const fixture = await createProject();
            const service = buildService();
            await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );

            await expect(
                service.execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: 'not-the-plan',
                    idempotencyKey: randomUUID(),
                }),
            ).rejects.toThrow(
                new ConflictError(
                    WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
                ),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('a switch request that differs from the previewed one aborts', async () => {
            const fixture = await createProject();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );

            await expect(
                service.execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest({
                        connection: {
                            name: 'Finance',
                            warehouseConnection: {
                                ...financeCredentials,
                                dbname: 'other',
                            },
                        },
                    }),
                    planHash: plan.planHash,
                    idempotencyKey: randomUUID(),
                }),
            ).rejects.toThrow(WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE);
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('a SQL chart saved between the preview and the switch does not abort it', async () => {
            const fixture = await createProject();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            await database('saved_sql').insert({
                project_uuid: fixture.projectUuid,
                name: 'Late chart',
                slug: `late-${randomUUID()}`,
                created_by_user_uuid: fixture.userUuid,
            } as never);

            await service.execute(fixture.admin, fixture.projectUuid, {
                ...switchRequest(),
                planHash: plan.planHash,
                idempotencyKey: randomUUID(),
            });

            expect((await state(fixture.projectUuid)).mode).toBe('multi');
        });

        test('a change to the original credentials between the preview and the switch aborts it', async () => {
            const fixture = await createProject();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            await database('warehouse_credentials')
                .where('project_id', fixture.projectId)
                .update({
                    encrypted_credentials: encrypt({
                        ...postgresCredentials,
                        host: 'moved.internal',
                    }),
                } as never);

            await expect(
                service.execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: plan.planHash,
                    idempotencyKey: randomUUID(),
                }),
            ).rejects.toThrow(WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE);
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('the plan counts what stays on the original and who has personal credentials', async () => {
            const fixture = await createProject({
                credentials: {
                    ...postgresCredentials,
                    requireUserCredentials: true,
                },
            });
            const [space] = await database('spaces')
                .insert({
                    name: 'Space',
                    project_id: fixture.projectId,
                    slug: `space-${randomUUID()}`,
                    path: `space_${randomUUID().replaceAll('-', '_')}`,
                } as never)
                .returning('space_id');
            const [dashboard] = await database('dashboards')
                .insert({
                    name: 'Dashboard',
                    space_id: space.space_id,
                    slug: `dashboard-${randomUUID()}`,
                    project_uuid: fixture.projectUuid,
                } as never)
                .returning('dashboard_uuid');
            await database('scheduler').insert({
                name: 'Weekly',
                created_by: fixture.userUuid,
                cron: '0 9 * * 1',
                dashboard_uuid: dashboard.dashboard_uuid,
                format: 'image',
            } as never);
            await database('cached_explore').insert({
                project_uuid: fixture.projectUuid,
                name: 'orders',
                table_names: ['orders'],
                explore: JSON.stringify(explore('orders')),
            } as never);
            const [chart] = await database('saved_sql')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Revenue',
                    slug: `revenue-${randomUUID()}`,
                    created_by_user_uuid: fixture.userUuid,
                } as never)
                .returning('saved_sql_uuid');
            await database('saved_sql_versions').insert(
                [1, 2].map(() => ({
                    saved_sql_uuid: chart.saved_sql_uuid,
                    sql: 'select 1',
                    limit: 500,
                    config: '{}',
                    chart_kind: 'vertical_bar',
                    created_by_user_uuid: fixture.userUuid,
                })) as never,
            );
            await database('project_dbt_sources').insert({
                project_uuid: fixture.projectUuid,
                name: 'marketing',
                is_primary: false,
                precedence: 1,
                dbt_connection_type: 'github',
            } as never);
            const [personal] = await database('user_warehouse_credentials')
                .insert({
                    user_uuid: fixture.userUuid,
                    name: 'Mine',
                    warehouse_type: WarehouseTypes.POSTGRES,
                    encrypted_credentials: encrypt(postgresCredentials),
                } as never)
                .returning('user_warehouse_credentials_uuid');
            await database(
                'project_user_warehouse_credentials_preference',
            ).insert({
                user_uuid: fixture.userUuid,
                project_uuid: fixture.projectUuid,
                user_warehouse_credentials_uuid:
                    personal.user_warehouse_credentials_uuid,
            });

            const plan = await buildService().preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );

            expect(plan.staysOnOriginal).toEqual({
                explores: 1,
                sqlCharts: 1,
                sqlChartVersions: 2,
                dbtSources: 2,
                scheduledDeliveries: 1,
                dashboards: 1,
            });
            expect(plan.personalCredentials).toEqual({
                usersWithPersonalCredentials: 1,
                requireUserCredentials: true,
            });
        });

        test('the switch records an audit event and an analytics event after the commit', async () => {
            const fixture = await createProject();

            const { result } = await switchProject(fixture);

            expect(logAuditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'update',
                    resource: expect.objectContaining({
                        type: 'Project',
                        projectUuid: fixture.projectUuid,
                        organizationUuid: fixture.organizationUuid,
                        metadata: expect.objectContaining({
                            event: 'switched_to_multi',
                            eventUuid: result.eventUuid,
                        }),
                    }),
                    status: 'allowed',
                }),
            );
            expect(analytics.track).toHaveBeenCalledWith({
                event: 'warehouse_connections.switched_to_multi',
                userId: fixture.userUuid,
                properties: {
                    organizationId: fixture.organizationUuid,
                    projectId: fixture.projectUuid,
                    warehouseType: WarehouseTypes.POSTGRES,
                },
            });
        });

        test('an audit or analytics failure after the commit does not undo the switch', async () => {
            const fixture = await createProject();
            vi.mocked(logAuditEvent).mockImplementation(() => {
                throw new Error('audit sink down');
            });
            analytics.track.mockImplementation(() => {
                throw new Error('analytics down');
            });

            await switchProject(fixture);

            expect((await state(fixture.projectUuid)).mode).toBe('multi');
        });
    });

    describe('a failed switch', () => {
        test('an error after the connection rows are inserted and before the commit leaves the project exactly single', async () => {
            const fixture = await createProject();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            const credentialsBefore = await database('warehouse_credentials')
                .where('project_id', fixture.projectId)
                .first();
            vi.spyOn(
                WarehouseConnectionSwitchModel.prototype,
                'insertSwitchEvent',
            ).mockRejectedValue(
                new Error('injected failure before the commit'),
            );

            await expect(
                service.execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: plan.planHash,
                    idempotencyKey: randomUUID(),
                }),
            ).rejects.toThrow('injected failure before the commit');

            expect(await state(fixture.projectUuid)).toEqual(singleState);
            expect(await route(fixture.projectUuid)).toBe('single');
            expect(
                await database('warehouse_credentials')
                    .where('project_id', fixture.projectId)
                    .first(),
            ).toEqual(credentialsBefore);
            expect(logAuditEvent).not.toHaveBeenCalled();
            expect(analytics.track).not.toHaveBeenCalled();
        });

        test('a failed connection test writes nothing', async () => {
            const fixture = await createProject();
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

            await expect(
                buildService().preview(
                    fixture.admin,
                    fixture.projectUuid,
                    switchRequest(),
                ),
            ).rejects.toThrow(
                'Warehouse connection test failed: password authentication failed',
            );
            await expect(
                buildService().execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: 'any',
                    idempotencyKey: randomUUID(),
                }),
            ).rejects.toThrow('Warehouse connection test failed');
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });
    });

    describe('preconditions', () => {
        const refusesBoth = async (
            fixture: Fixture,
            expected: Error,
            actor: SessionAccount = fixture.admin,
            request: ApiWarehouseConnectionSwitchRequest = switchRequest(),
            service: WarehouseConnectionSwitchService = buildService(),
        ) => {
            await expect(
                service.preview(actor, fixture.projectUuid, request),
            ).rejects.toThrow(expected);
            await expect(
                service.execute(actor, fixture.projectUuid, {
                    ...request,
                    planHash: 'any',
                    idempotencyKey: randomUUID(),
                }),
            ).rejects.toThrow(expected);
            expect(await state(fixture.projectUuid)).toEqual({
                ...(await state(fixture.projectUuid)),
                events: [],
            });
        };

        test('requires permission to manage the project', async () => {
            const fixture = await createProject();

            await refusesBoth(
                fixture,
                new ForbiddenError(
                    'You do not have permission to manage this project',
                ),
                fixture.viewer,
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('requires the rollout flag, the licence and a supported warehouse type', async () => {
            const flagged = await createProject();
            flag.enabled = false;
            await refusesBoth(flagged, new ForbiddenError(ROLLOUT_REASON));
            flag.enabled = true;

            const unlicensed = await createProject();
            await refusesBoth(
                unlicensed,
                new ForbiddenError(ENTITLEMENT_REASON),
                unlicensed.admin,
                switchRequest(),
                buildService(false),
            );

            const snowflake = await createProject({
                credentials: snowflakeCredentials,
            });
            await refusesBoth(
                snowflake,
                new ForbiddenError(WAREHOUSE_TYPE_REASON),
                snowflake.admin,
                switchRequest({
                    connection: {
                        name: 'Finance',
                        warehouseConnection: snowflakeCredentials,
                    },
                }),
            );
            for (const fixture of [flagged, unlicensed, snowflake]) {
                // eslint-disable-next-line no-await-in-loop
                expect(await state(fixture.projectUuid)).toEqual(singleState);
            }
        });

        test.each([
            { name: 'a preview', type: ProjectType.PREVIEW, source: null },
            {
                name: 'a training copy',
                type: ProjectType.TRAINING,
                source: 'training',
            },

            {
                name: 'a playground',
                type: ProjectType.DEFAULT,
                source: 'playground',
            },
        ])('refuses $name', async ({ type, source }) => {
            const fixture = await createProject({
                type,
                provisioningSource: source,
            });

            await refusesBoth(
                fixture,
                new ForbiddenError(DEFAULT_PROJECT_ONLY_REASON),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('refuses the analytics project through the credential policy', async () => {
            const fixture = await createProject({
                provisioningSource: 'analytics',
            });

            await refusesBoth(
                fixture,
                new ForbiddenError(
                    'Internal analytics configuration is managed by the backend',
                ),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('refuses a project without warehouse credentials', async () => {
            const fixture = await createProject({ withCredentials: false });

            await refusesBoth(
                fixture,
                new ForbiddenError(WAREHOUSE_TYPE_REASON),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('refuses a project whose original uses an organisation credential', async () => {
            const fixture = await createProject();
            await database('projects')
                .where('project_uuid', fixture.projectUuid)
                .update({
                    organization_warehouse_credentials_uuid:
                        await createOrganizationCredential(
                            fixture.organizationUuid,
                            postgresCredentials,
                        ),
                } as never);

            await refusesBoth(
                fixture,
                new ForbiddenError(ORIGINAL_ORGANIZATION_CREDENTIALS_REASON),
            );
        });

        test('refuses an extra connection of another warehouse type', async () => {
            const fixture = await createProject();

            await refusesBoth(
                fixture,
                new ParameterError(
                    'An extra connection must use the same warehouse type as the original connection.',
                ),
                fixture.admin,
                switchRequest({
                    connection: {
                        name: 'Finance',
                        warehouseConnection: snowflakeCredentials,
                    },
                }),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test.each([
            {
                name: 'a blank original name',
                original: '  ',
                extra: 'Finance',
                error: new ParameterError('Enter a name'),
            },
            {
                name: 'a blank extra name',
                original: 'Main',
                extra: ' ',
                error: new ParameterError('Enter a name'),
            },
            {
                name: 'a long name',
                original: 'x'.repeat(101),
                extra: 'Finance',
                error: new ParameterError(
                    'Name must be 100 characters or fewer',
                ),
            },
            {
                name: 'the same name twice',
                original: 'Finance',
                extra: ' Finance ',
                error: new ConflictError(
                    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
                ),
            },
        ])('refuses $name', async ({ original, extra, error }) => {
            const fixture = await createProject();

            await refusesBoth(
                fixture,
                error,
                fixture.admin,
                switchRequest({
                    original: {
                        name: original,
                        listAllDatabases: false,
                        additionalDatabases: [],
                    },
                    connection: {
                        name: extra,
                        warehouseConnection: financeCredentials,
                    },
                }),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('refuses an organisation credential for the extra connection without permission to view it', async () => {
            const fixture = await createProject();
            const organizationCredential = await createOrganizationCredential(
                fixture.organizationUuid,
            );

            await refusesBoth(
                fixture,
                new ForbiddenError(
                    'You do not have permission to use these organization warehouse credentials',
                ),
                fixture.admin,
                switchRequest({
                    connection: {
                        name: 'Finance',
                        organizationWarehouseCredentialsUuid:
                            organizationCredential,
                    },
                }),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('switches with an organisation credential for the extra connection when the actor may view it', async () => {
            const fixture = await createProject();
            const organizationCredential = await createOrganizationCredential(
                fixture.organizationUuid,
            );
            const request = switchRequest({
                connection: {
                    name: 'Finance',
                    organizationWarehouseCredentialsUuid:
                        organizationCredential,
                },
            });
            const service = buildService();
            const plan = await service.preview(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                request,
            );

            await service.execute(
                fixture.credentialsAdmin,
                fixture.projectUuid,
                {
                    ...request,
                    planHash: plan.planHash,
                    idempotencyKey: randomUUID(),
                },
            );

            expect(plan.connection).toEqual({
                name: 'Finance',
                warehouseType: WarehouseTypes.POSTGRES,
                database: 'finance',
                usesOrganizationCredentials: true,
            });
            expect(
                await database('warehouse_connections')
                    .where('project_uuid', fixture.projectUuid)
                    .where('is_original', false)
                    .first(
                        'organization_warehouse_credentials_uuid',
                        'encrypted_credentials',
                    ),
            ).toEqual({
                organization_warehouse_credentials_uuid: organizationCredential,
                encrypted_credentials: null,
            });
        });

        test('reports whether the switch is available and why not', async () => {
            const fixture = await createProject();
            const service = buildService();

            await expect(
                service.getAvailability(fixture.admin, fixture.projectUuid),
            ).resolves.toEqual({
                canSwitch: true,
                reason: null,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            });
            flag.enabled = false;
            await expect(
                service.getAvailability(fixture.admin, fixture.projectUuid),
            ).resolves.toEqual({
                canSwitch: false,
                reason: ROLLOUT_REASON,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            });
            flag.enabled = true;
            await switchProject(fixture);
            await expect(
                service.getAvailability(fixture.admin, fixture.projectUuid),
            ).resolves.toEqual({
                canSwitch: false,
                reason: WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            });
            await expect(
                service.getAvailability(fixture.viewer, fixture.projectUuid),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });

    describe('idempotency and concurrency', () => {
        test('a retried switch with the same key returns the same event and adds nothing', async () => {
            const fixture = await createProject();
            const key = randomUUID();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            const execute = () =>
                service.execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: plan.planHash,
                    idempotencyKey: key,
                });

            const first = await execute();
            const retry = await execute();

            expect(retry).toEqual(first);
            const after = await state(fixture.projectUuid);
            expect(after.connections).toHaveLength(2);
            expect(after.events).toHaveLength(1);
        });

        test('a retry with the same key after the extra connection was renamed still returns the switch', async () => {
            const fixture = await createProject();
            const key = randomUUID();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            const execute = () =>
                service.execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: plan.planHash,
                    idempotencyKey: key,
                });
            const first = await execute();
            await buildConnectionService().rename(
                fixture.admin,
                fixture.projectUuid,
                first.warehouseConnectionUuid,
                'Finance renamed',
            );

            await expect(execute()).resolves.toEqual(first);
            const after = await state(fixture.projectUuid);
            expect(after.connections).toHaveLength(2);
            expect(after.events).toHaveLength(1);
        });

        test('a switch with another key on a project that is already multi is refused with 409 and adds nothing', async () => {
            const fixture = await createProject();
            await switchProject(fixture);

            const refusal = await buildService()
                .execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest({
                        connection: {
                            name: 'Marketing',
                            warehouseConnection: financeCredentials,
                        },
                    }),
                    planHash: 'any',
                    idempotencyKey: randomUUID(),
                })
                .catch((error: unknown) => error);

            expect(refusal).toEqual(
                new ConflictError(WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE),
            );
            expect((refusal as ConflictError).statusCode).toBe(409);
            const after = await state(fixture.projectUuid);
            expect(after.connections.map(({ name }) => name)).toEqual([
                'Main warehouse',
                'Finance',
            ]);
            expect(after.events).toHaveLength(1);
        });

        test('a key already used on another project is refused', async () => {
            const first = await createProject();
            const second = await createProject();
            const key = randomUUID();
            await switchProject(first, switchRequest(), key);

            await expect(
                switchProject(second, switchRequest(), key),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(await state(second.projectUuid)).toEqual(singleState);
        });

        test('two admins switching at once with different keys: one succeeds, the other gets 409, and no connection is lost silently', async () => {
            const fixture = await createProject();
            const service = buildService();
            const requests = ['Finance', 'Marketing'].map((name) =>
                switchRequest({
                    connection: {
                        name,
                        warehouseConnection: financeCredentials,
                    },
                }),
            );
            const plans = await Promise.all(
                requests.map((request) =>
                    service.preview(
                        fixture.admin,
                        fixture.projectUuid,
                        request,
                    ),
                ),
            );

            const outcomes = await Promise.allSettled(
                requests.map((request, index) =>
                    service.execute(fixture.admin, fixture.projectUuid, {
                        ...request,
                        planHash: plans[index].planHash,
                        idempotencyKey: randomUUID(),
                    }),
                ),
            );

            expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
                'fulfilled',
                'rejected',
            ]);
            const rejected = outcomes.find(
                (outcome): outcome is PromiseRejectedResult =>
                    outcome.status === 'rejected',
            );
            expect(rejected?.reason).toEqual(
                new ConflictError(WAREHOUSE_CONNECTION_ALREADY_MULTI_MESSAGE),
            );
            const after = await state(fixture.projectUuid);
            expect(after.connections).toHaveLength(2);
            expect(after.events).toHaveLength(1);
        });

        test('two retries with the same key at once return the same event', async () => {
            const fixture = await createProject();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            const key = randomUUID();

            const results = await Promise.all(
                [1, 2].map(() =>
                    service.execute(fixture.admin, fixture.projectUuid, {
                        ...switchRequest(),
                        planHash: plan.planHash,
                        idempotencyKey: key,
                    }),
                ),
            );

            expect(results[1]).toEqual(results[0]);
            expect((await state(fixture.projectUuid)).events).toHaveLength(1);
        });

        test('a settings save that holds the project row makes the switch wait, and its credential change aborts the switch', async () => {
            const fixture = await createProject();
            const service = buildService();
            const plan = await service.preview(
                fixture.admin,
                fixture.projectUuid,
                switchRequest(),
            );
            const settingsSave = await database.transaction();
            await settingsSave('projects')
                .where('project_uuid', fixture.projectUuid)
                .update({ name: 'Renamed' } as never);
            await settingsSave('warehouse_credentials')
                .where('project_id', fixture.projectId)
                .update({
                    encrypted_credentials: encrypt({
                        ...postgresCredentials,
                        host: 'moved.internal',
                    }),
                } as never);

            const switching = service
                .execute(fixture.admin, fixture.projectUuid, {
                    ...switchRequest(),
                    planHash: plan.planHash,
                    idempotencyKey: randomUUID(),
                })
                .catch((error: unknown) => error);
            await waitForLockWait();
            await settingsSave.commit();

            expect(await switching).toEqual(
                new ConflictError(
                    WAREHOUSE_CONNECTION_SWITCH_PLAN_CHANGED_MESSAGE,
                ),
            );
            expect(await state(fixture.projectUuid)).toEqual(singleState);
        });

        test('a compile that starts before the switch and finishes after it saves explores bound to the original', async () => {
            const fixture = await createProject();
            let releaseCompile: () => void = () => {};
            const compileGate = new Promise<void>((resolve) => {
                releaseCompile = resolve;
            });
            let compileStarted: () => void = () => {};
            const started = new Promise<void>((resolve) => {
                compileStarted = resolve;
            });
            const compiling = projectModel.saveExploreStreamToCache(
                fixture.projectUuid,
                (async function* stream() {
                    yield explore('orders');
                    compileStarted();
                    await compileGate;
                    yield explore('customers');
                })(),
            );
            await started;

            await switchProject(fixture);
            releaseCompile();
            await compiling;

            expect(await route(fixture.projectUuid)).toBe('multi');
            expect(
                await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .orderBy('name')
                    .select('name', 'warehouse_connection_uuid'),
            ).toEqual([
                { name: 'customers', warehouse_connection_uuid: null },
                { name: 'orders', warehouse_connection_uuid: null },
            ]);
        });

        test('a query binding saved before the switch still reads the original credentials after it', async () => {
            const fixture = await createProject();
            const credentialsService = new ProjectService({
                lightdashConfig: lightdashConfigMock,
                projectModel,
                userWarehouseCredentialsModel:
                    new UserWarehouseCredentialsModel({
                        database,
                        encryptionUtil,
                    }),
                organizationWarehouseCredentialsModel,
                warehouseConnectionModel: connectionModel,
            } as never) as unknown as {
                getWarehouseCredentials: (args: {
                    projectUuid: string;
                    userId: string;
                    isRegisteredUser: boolean;
                    binding: {
                        kind: 'connection';
                        warehouseConnectionUuid: null;
                    };
                }) => Promise<CreateWarehouseCredentials>;
                refreshCredentials: (
                    credentials: CreateWarehouseCredentials,
                ) => Promise<CreateWarehouseCredentials>;
            };
            vi.spyOn(
                credentialsService,
                'refreshCredentials',
            ).mockImplementation(async (credentials) => credentials);
            const read = () =>
                credentialsService.getWarehouseCredentials({
                    projectUuid: fixture.projectUuid,
                    userId: fixture.userUuid,
                    isRegisteredUser: true,
                    binding: {
                        kind: 'connection',
                        warehouseConnectionUuid: null,
                    },
                });
            const before = await read();

            await switchProject(fixture);

            expect(await route(fixture.projectUuid)).toBe('multi');
            expect(await read()).toEqual(before);
        });
    });

    describe('with the rollout flag off after a switch (D9)', () => {
        test('no new switch and no new connection, while the switched project keeps routing multi and can remove a connection', async () => {
            const switched = await createProject();
            const { result } = await switchProject(switched);
            const other = await createProject();
            flag.enabled = false;

            await expect(
                buildService().preview(
                    other.admin,
                    other.projectUuid,
                    switchRequest(),
                ),
            ).rejects.toThrow(new ForbiddenError(ROLLOUT_REASON));
            await expect(
                buildConnectionService().create(
                    switched.admin,
                    switched.projectUuid,
                    {
                        name: 'Marketing',
                        warehouseConnection: financeCredentials,
                    },
                ),
            ).rejects.toThrow(new ForbiddenError(ROLLOUT_REASON));
            expect(await route(switched.projectUuid)).toBe('multi');

            await buildConnectionService().delete(
                switched.admin,
                switched.projectUuid,
                result.warehouseConnectionUuid,
            );
            expect(await route(switched.projectUuid)).toBe('single');
            expect(await state(other.projectUuid)).toEqual(singleState);
        });
    });

    describe('removal after the switch', () => {
        test('is refused while content is bound, allowed once it is unbound, and the project then routes single', async () => {
            const fixture = await createProject();
            const { result } = await switchProject(fixture);
            const extra = result.warehouseConnectionUuid;
            const [source] = await database('project_dbt_sources')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'finance',
                    is_primary: false,
                    precedence: 1,
                    dbt_connection_type: 'github',
                    warehouse_connection_uuid: extra,
                } as never)
                .returning('project_dbt_source_uuid');
            await projectModel.saveMultiConnectionExplores(
                fixture.projectUuid,
                (async function* stream() {
                    yield {
                        explore: explore('payments'),
                        warehouseConnectionUuid: extra,
                    };
                })(),
                { kind: 'connections', warehouseConnectionUuids: [] },
            );
            const [chart] = await database('saved_sql')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Revenue',
                    slug: `revenue-${randomUUID()}`,
                    created_by_user_uuid: fixture.userUuid,
                } as never)
                .returning('saved_sql_uuid');
            const version = (warehouseConnectionUuid: string | null) =>
                database('saved_sql_versions').insert({
                    saved_sql_uuid: chart.saved_sql_uuid,
                    sql: 'select 1',
                    limit: 500,
                    config: '{}',
                    chart_kind: 'vertical_bar',
                    created_by_user_uuid: fixture.userUuid,
                    warehouse_connection_uuid: warehouseConnectionUuid,
                } as never);
            await version(extra);
            const remove = () =>
                buildConnectionService().delete(
                    fixture.admin,
                    fixture.projectUuid,
                    extra,
                );

            await expect(remove()).rejects.toThrow(
                "Connection 'Finance' cannot be removed while content uses it. explores: payments; dbt sources: finance; SQL charts: Revenue.",
            );

            await database('project_dbt_sources')
                .where(
                    'project_dbt_source_uuid',
                    source.project_dbt_source_uuid,
                )
                .update({ warehouse_connection_uuid: null } as never);
            await projectModel.saveMultiConnectionExplores(
                fixture.projectUuid,
                (async function* stream() {
                    yield {
                        explore: explore('payments'),
                        warehouseConnectionUuid: null,
                    };
                })(),
                { kind: 'connections', warehouseConnectionUuids: [] },
            );
            await version(null);
            await remove();

            expect(await route(fixture.projectUuid)).toBe('single');
            expect(
                await database('saved_sql_versions')
                    .where('saved_sql_uuid', chart.saved_sql_uuid)
                    .pluck('warehouse_connection_uuid'),
            ).toEqual([null, null]);
            expect(
                (await state(fixture.projectUuid)).events.map(
                    ({ event }) => event,
                ),
            ).toEqual(['switched_to_multi', 'connection_removed']);
        });
    });

    describe('the rescue script', () => {
        const bindEverything = async (fixture: Fixture, extra: string) => {
            await database('project_dbt_sources').insert({
                project_uuid: fixture.projectUuid,
                name: 'finance',
                is_primary: false,
                precedence: 1,
                dbt_connection_type: 'github',
                warehouse_connection_uuid: extra,
            } as never);
            await projectModel.saveMultiConnectionExplores(
                fixture.projectUuid,
                (async function* stream() {
                    yield {
                        explore: explore('payments'),
                        warehouseConnectionUuid: extra,
                    };
                    yield {
                        explore: explore('orders'),
                        warehouseConnectionUuid: null,
                    };
                })(),
                { kind: 'connections', warehouseConnectionUuids: [] },
            );
            const [chart] = await database('saved_sql')
                .insert({
                    project_uuid: fixture.projectUuid,
                    name: 'Revenue',
                    slug: `revenue-${randomUUID()}`,
                    created_by_user_uuid: fixture.userUuid,
                } as never)
                .returning('saved_sql_uuid');
            await database('saved_sql_versions').insert(
                [extra, extra].map((warehouseConnectionUuid) => ({
                    saved_sql_uuid: chart.saved_sql_uuid,
                    sql: 'select 1',
                    limit: 500,
                    config: '{}',
                    chart_kind: 'vertical_bar',
                    created_by_user_uuid: fixture.userUuid,
                    warehouse_connection_uuid: warehouseConnectionUuid,
                })) as never,
            );
            const [user] = await database('users')
                .insert({ first_name: 'Chooser', last_name: 'User' } as never)
                .returning('user_uuid');
            const [personal] = await database('user_warehouse_credentials')
                .insert({
                    user_uuid: user.user_uuid,
                    name: 'Mine',
                    warehouse_type: WarehouseTypes.POSTGRES,
                    encrypted_credentials: encrypt(postgresCredentials),
                } as never)
                .returning('user_warehouse_credentials_uuid');
            await database(
                'warehouse_connection_user_credentials_preference',
            ).insert({
                user_uuid: user.user_uuid,
                warehouse_connection_uuid: extra,
                user_warehouse_credentials_uuid:
                    personal.user_warehouse_credentials_uuid,
            });
            await database('warehouse_connection_manifests').insert({
                warehouse_connection_uuid: extra,
                manifest: Buffer.from('manifest'),
            });
            return chart.saved_sql_uuid as string;
        };

        test('a dry run reports what is bound and changes nothing', async () => {
            const fixture = await createProject();
            const { result } = await switchProject(fixture);
            await bindEverything(fixture, result.warehouseConnectionUuid);
            const before = await state(fixture.projectUuid);

            const report = await rescueWarehouseConnection(database, {
                projectUuid: fixture.projectUuid,
                warehouseConnectionUuid: result.warehouseConnectionUuid,
                engineer: 'engineer@example.com',
                ticket: 'SPK-0000',
                execute: false,
            });

            expect(report).toEqual({
                executed: false,
                connectionName: 'Finance',
                counts: {
                    explores: 1,
                    dbtSources: 1,
                    sqlChartVersions: 2,
                    userCredentialPreferences: 1,
                },
                routeAfter: 'multi',
            });
            expect(await state(fixture.projectUuid)).toEqual(before);
        });

        test('rescues a project with content bound on every table, which then routes single with everything on the original', async () => {
            const fixture = await createProject();
            const { result } = await switchProject(fixture);
            const extra = result.warehouseConnectionUuid;
            const chartUuid = await bindEverything(fixture, extra);

            const report = await rescueWarehouseConnection(database, {
                projectUuid: fixture.projectUuid,
                warehouseConnectionUuid: extra,
                engineer: 'engineer@example.com',
                ticket: 'SPK-0000',
                execute: true,
            });

            expect(report).toEqual({
                executed: true,
                connectionName: 'Finance',
                counts: {
                    explores: 1,
                    dbtSources: 1,
                    sqlChartVersions: 2,
                    userCredentialPreferences: 1,
                },
                routeAfter: 'single',
            });
            expect(await route(fixture.projectUuid)).toBe('single');
            expect(
                await database('project_dbt_sources')
                    .where('project_uuid', fixture.projectUuid)
                    .pluck('warehouse_connection_uuid'),
            ).toEqual([null]);
            expect(
                await database('saved_sql_versions')
                    .where('saved_sql_uuid', chartUuid)
                    .pluck('warehouse_connection_uuid'),
            ).toEqual([null, null]);
            expect(
                await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .select('name', 'warehouse_connection_uuid'),
            ).toEqual([{ name: 'orders', warehouse_connection_uuid: null }]);
            for (const table of [
                'warehouse_connection_user_credentials_preference',
                'warehouse_connection_manifests',
            ]) {
                expect(
                    // eslint-disable-next-line no-await-in-loop
                    await database(table).where(
                        'warehouse_connection_uuid',
                        extra,
                    ),
                ).toEqual([]);
            }
            const after = await state(fixture.projectUuid);
            expect(after.connections.map(({ name }) => name)).toEqual([
                'Main warehouse',
            ]);
            expect(after.events.at(-1)).toEqual({
                event: 'rescued_by_engineering',
                plan: {
                    warehouseConnectionUuid: extra,
                    connectionName: 'Finance',
                    engineer: 'engineer@example.com',
                    ticket: 'SPK-0000',
                    counts: {
                        explores: 1,
                        dbtSources: 1,
                        sqlChartVersions: 2,
                        userCredentialPreferences: 1,
                    },
                },
                plan_hash: null,
                idempotency_key: null,
            });
        });

        test.each([
            { name: 'the original connection', pick: 'original' as const },
            { name: 'a connection of another project', pick: 'other' as const },
            { name: 'an unknown connection', pick: 'unknown' as const },
        ])('refuses $name and changes nothing', async ({ pick }) => {
            const fixture = await createProject();
            const { result } = await switchProject(fixture);
            await bindEverything(fixture, result.warehouseConnectionUuid);
            const other = await createProject();
            const otherSwitch = await switchProject(other);
            const target = {
                original: result.originalWarehouseConnectionUuid,
                other: otherSwitch.result.warehouseConnectionUuid,
                unknown: randomUUID(),
            }[pick];
            const before = await state(fixture.projectUuid);

            await expect(
                rescueWarehouseConnection(database, {
                    projectUuid: fixture.projectUuid,
                    warehouseConnectionUuid: target,
                    engineer: 'engineer@example.com',
                    ticket: 'SPK-0000',
                    execute: true,
                }),
            ).rejects.toThrow(
                'The project has no extra connection with this uuid',
            );
            expect(await state(fixture.projectUuid)).toEqual(before);
        });

        test('refuses without an engineer and a ticket, and changes nothing', async () => {
            const fixture = await createProject();
            const { result } = await switchProject(fixture);
            await bindEverything(fixture, result.warehouseConnectionUuid);
            const before = await state(fixture.projectUuid);

            await expect(
                rescueWarehouseConnection(database, {
                    projectUuid: fixture.projectUuid,
                    warehouseConnectionUuid: result.warehouseConnectionUuid,
                    engineer: ' ',
                    ticket: 'SPK-0000',
                    execute: true,
                }),
            ).rejects.toThrow('Name the engineer and the ticket');
            expect(await state(fixture.projectUuid)).toEqual(before);
        });

        test('a failure at the last step rolls every step back', async () => {
            const fixture = await createProject();
            const { result } = await switchProject(fixture);
            const chartUuid = await bindEverything(
                fixture,
                result.warehouseConnectionUuid,
            );
            const before = await state(fixture.projectUuid);
            await database.raw(`
                CREATE FUNCTION fail_rescue_event() RETURNS trigger AS $$
                BEGIN
                    RAISE EXCEPTION 'injected rescue failure';
                END;
                $$ LANGUAGE plpgsql
            `);
            await database.raw(`
                CREATE TRIGGER fail_rescue_event
                BEFORE INSERT ON project_connection_mode_events
                FOR EACH ROW WHEN (NEW.event = 'rescued_by_engineering')
                EXECUTE FUNCTION fail_rescue_event()
            `);
            try {
                await expect(
                    rescueWarehouseConnection(database, {
                        projectUuid: fixture.projectUuid,
                        warehouseConnectionUuid: result.warehouseConnectionUuid,
                        engineer: 'engineer@example.com',
                        ticket: 'SPK-0000',
                        execute: true,
                    }),
                ).rejects.toThrow('injected rescue failure');
            } finally {
                await database.raw(
                    'DROP TRIGGER fail_rescue_event ON project_connection_mode_events',
                );
                await database.raw('DROP FUNCTION fail_rescue_event()');
            }

            expect(await state(fixture.projectUuid)).toEqual(before);
            expect(await route(fixture.projectUuid)).toBe('multi');
            expect(
                await database('saved_sql_versions')
                    .where('saved_sql_uuid', chartUuid)
                    .pluck('warehouse_connection_uuid'),
            ).toEqual([
                result.warehouseConnectionUuid,
                result.warehouseConnectionUuid,
            ]);
            expect(
                await database('cached_explore')
                    .where('project_uuid', fixture.projectUuid)
                    .where(
                        'warehouse_connection_uuid',
                        result.warehouseConnectionUuid,
                    )
                    .pluck('name'),
            ).toEqual(['payments']);
        });
    });
});
