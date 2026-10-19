import {
    ChartKind,
    ChartType,
    defineUserAbility,
    FeatureFlags,
    ForbiddenError,
    OrganizationMemberRole,
    PROJECT_TIMEZONE_SETTING,
    QueryExecutionContext,
    SpaceMemberRole,
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SavedSqlModel } from '../../../models/SavedSqlModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { SpacePermissionModel } from '../../../models/SpacePermissionModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { SpaceService } from '../../../services/SpaceService/SpaceService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const secret = 'space-connection-routing-test-secret';
const originalCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    port: 5432,
    user: 'original-user',
    password: 'test-only-password',
    dbname: 'analytics',
    schema: 'public',
    requireUserCredentials: false,
};
const extraCredentials = { ...originalCredentials, user: 'space-user' };

type RoutingInternals = {
    combineParameters: () => Promise<never>;
};

const credentialsResolved = new Error('Credentials resolved');

class RoutingQueryService extends AsyncQueryService {
    credentialUser: string | null = null;

    protected override async getWarehouseCredentialsWithConnection(
        args: Parameters<
            AsyncQueryService['getWarehouseCredentialsWithConnection']
        >[0],
    ): Promise<never> {
        const { warehouseCredentials } =
            await super.getWarehouseCredentialsWithConnection(args);
        if (warehouseCredentials.type !== WarehouseTypes.POSTGRES)
            throw new Error('Unexpected warehouse type');
        this.credentialUser = warehouseCredentials.user;
        throw credentialsResolved;
    }
}

describe('Space warehouse routing on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let spaceModel: SpaceModel;
    let savedSqlModel: SavedSqlModel;
    let featureFlagModel: FeatureFlagModel;
    let service: RoutingQueryService;
    let spaceService: SpaceService;
    let warehouseConnectionModel: WarehouseConnectionModel;
    let internals: RoutingInternals;
    let projectUuid: string;
    let organizationUuid: string;
    let extraConnectionUuid: string;
    let userUuid: string;
    let account: ReturnType<typeof fromSession>;
    let spaceA: string;
    let child: string;
    let spaceB: string;
    const charts: string[] = [];

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        const encryptionUtil = new EncryptionUtil({
            lightdashConfig: {
                ...lightdashConfigMock,
                lightdashSecret: secret,
                lightdashSecrets: {
                    active: secret,
                    fallbacks: [],
                    all: [secret],
                },
            },
        });
        const config = {
            ...lightdashConfigMock,
            enabledFeatureFlags: new Set<string>(),
            disabledFeatureFlags: new Set<string>(),
            previewFeatureFlags: { enabled: false },
        };
        featureFlagModel = new FeatureFlagModel({
            database,
            lightdashConfig: config,
        });
        spaceModel = new SpaceModel({ database });
        savedSqlModel = new SavedSqlModel({
            database,
            lightdashConfig: config,
        });
        const projectModel = new ProjectModel({
            database,
            lightdashConfig: config,
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
        const spacePermissionService = new SpacePermissionService({
            spaceModel,
            spacePermissionModel: new SpacePermissionModel(database),
            featureFlagModel,
            appAccessModel: {} as never,
            documentAccessModel: {} as never,
            dashboardAccessModel: {} as never,
            savedChartAccessModel: {} as never,
            savedSqlAccessModel: {} as never,
            directAccessFeatureGate: {
                isEnabledForUser: async () => false,
            } as never,
        });
        service = new RoutingQueryService({
            lightdashConfig: config,
            featureFlagModel,
            projectModel,
            spaceModel,
            spacePermissionService,
            savedChartModel: new SavedChartModel({
                database,
                lightdashConfig: config,
            }),
            analyticsModel: { addChartViewEvent: async () => undefined },
            organizationSettingsModel: {
                get: async () => ({ queryLimit: null, csvCellsLimit: null }),
            },
            organizationWarehouseCredentialsModel,
            warehouseConnectionModel,
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
        } as never);
        spaceService = new SpaceService({
            analytics: analyticsMock,
            projectModel,
            featureFlagModel,
            warehouseConnectionModel,
            spaceModel,
            spacePermissionService,
        } as never);
        internals = service as unknown as RoutingInternals;
        vi.spyOn(service, 'getExploreWithUserAccessControls').mockResolvedValue(
            {
                explore: { ...validExplore, name: 'orders' },
                userAccessControls: {
                    userAttributes: {},
                    intrinsicUserAttributes: {},
                },
            },
        );
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Space routing test' })
            .returning('*');
        organizationUuid = organization.organization_uuid;
        const [user] = await database('users')
            .insert({ first_name: 'Space', last_name: 'Developer' } as never)
            .returning('*');
        userUuid = user.user_uuid;
        await database('organization_memberships').insert({
            organization_id: organization.organization_id,
            user_id: user.user_id,
            role: OrganizationMemberRole.DEVELOPER,
        });

        account = fromSession(
            {
                ...defaultSessionUser,
                organizationUuid,
                userUuid,
                userId: user.user_id,
                ability: defineUserAbility(
                    {
                        organizationUuid,
                        userUuid,
                        role: OrganizationMemberRole.DEVELOPER,
                    },
                    [],
                ),
            },
            'test-session',
        );
        const [project] = await database('projects')
            .insert({
                name: 'Space routing',
                organization_id: organization.organization_id,
                connection_mode: 'multi',
            } as never)
            .returning('*');
        projectUuid = project.project_uuid;
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: 'postgres',
            encrypted_credentials: encryptionUtil.encrypt(
                JSON.stringify(originalCredentials),
            ),
        } as never);
        await database('warehouse_connections').insert({
            project_uuid: projectUuid,
            is_original: true,
            name: 'Original',
        });
        const [extra] = await database('warehouse_connections')
            .insert({
                project_uuid: projectUuid,
                is_original: false,
                name: 'Space connection',
                warehouse_type: 'postgres',
                encrypted_credentials: encryptionUtil.encrypt(
                    JSON.stringify(extraCredentials),
                ),
            })
            .returning('warehouse_connection_uuid');
        extraConnectionUuid = extra.warehouse_connection_uuid;
        const a = await spaceModel.createSpace(
            {
                name: 'A',
                parentSpaceUuid: null,
                inheritParentPermissions: false,
            },
            { projectUuid, userId: user.user_id },
        );
        const nested = await spaceModel.createSpace(
            {
                name: 'child',
                parentSpaceUuid: a.uuid,
                inheritParentPermissions: true,
            },
            { projectUuid, userId: user.user_id },
        );
        const b = await spaceModel.createSpace(
            {
                name: 'B',
                parentSpaceUuid: null,
                inheritParentPermissions: true,
            },
            { projectUuid, userId: user.user_id },
        );
        spaceA = a.uuid;
        child = nested.uuid;
        spaceB = b.uuid;
        await spaceModel.update(spaceA, {
            warehouseConnectionUuid: extraConnectionUuid,
        });
        const chartUuids = await Promise.all(
            [spaceA, child, spaceB].map(async (spaceUuid) => {
                const space = await database('spaces')
                    .where('space_uuid', spaceUuid)
                    .first()
                    .select('space_id');
                if (!space) throw new Error('Missing test space');
                const [chart] = await database('saved_queries')
                    .insert({
                        project_uuid: projectUuid,
                        space_id: space.space_id,
                        dashboard_uuid: null,
                        name: `Chart ${spaceUuid}`,
                        slug: `chart-${spaceUuid}`,
                        description: '',
                        last_version_chart_kind: ChartKind.TABLE,
                        last_version_updated_by_user_uuid: userUuid,
                        color_palette_uuid: null,
                    })
                    .returning(['saved_query_uuid', 'saved_query_id']);
                await database('saved_queries_versions').insert({
                    saved_query_id: chart.saved_query_id,
                    explore_name: 'orders',
                    filters: {},
                    row_limit: 10,
                    metric_overrides: null,
                    dimension_overrides: null,
                    chart_type: ChartType.TABLE,
                    chart_config: null,
                    pivot_dimensions: null,
                    pivot_rows: null,
                    parameters: null,
                    updated_by_user_uuid: userUuid,
                    timezone: PROJECT_TIMEZONE_SETTING,
                    agent_identity: null,
                });
                return chart.saved_query_uuid;
            }),
        );
        charts.push(...chartUuids);
        await database('cached_explore').insert({
            project_uuid: projectUuid,
            name: 'orders',
            table_names: ['orders'],
            explore: JSON.stringify({ name: 'orders' }),
            warehouse_connection_uuid: null,
        } as never);
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(async () => {
        await featureFlagModel.upsertOrganizationOverride(
            FeatureFlags.SpaceWarehouseConnections,
            organizationUuid,
            true,
        );
        await database('space_user_access')
            .where('user_uuid', userUuid)
            .delete();
    });

    const chartCredentialUser = async (chartUuid: string) => {
        await database('space_user_access')
            .insert({
                user_uuid: userUuid,
                space_uuid: spaceA,
                space_role: SpaceMemberRole.VIEWER,
            })
            .onConflict(['user_uuid', 'space_uuid'])
            .ignore();
        service.credentialUser = null;
        await expect(
            service.executeAsyncSavedChartQuery({
                account,
                projectUuid,
                chartUuid,
                context: QueryExecutionContext.CHART,
            }),
        ).rejects.toBe(credentialsResolved);
        return service.credentialUser;
    };

    test('bound and nested charts use the space identity; unbound charts use the original', async () => {
        expect(await chartCredentialUser(charts[0])).toBe('space-user');
        expect(await chartCredentialUser(charts[1])).toBe('space-user');
        expect(await chartCredentialUser(charts[2])).toBe('original-user');
        expect(
            (await spaceModel.getSpaceSummary(spaceA)).warehouseConnectionUuid,
        ).toBe(extraConnectionUuid);
    });

    test('Console disable and re-enable change the next credential read', async () => {
        await featureFlagModel.upsertOrganizationOverride(
            FeatureFlags.SpaceWarehouseConnections,
            organizationUuid,
            false,
        );
        expect(await chartCredentialUser(charts[0])).toBe('original-user');
        expect(await chartCredentialUser(charts[1])).toBe('original-user');
        await featureFlagModel.upsertOrganizationOverride(
            FeatureFlags.SpaceWarehouseConnections,
            organizationUuid,
            true,
        );
        expect(await chartCredentialUser(charts[1])).toBe('space-user');
    });

    test('a closer binding overrides its ancestor and clearing restores inheritance', async () => {
        const [original] = await database('warehouse_connections')
            .where({ project_uuid: projectUuid, is_original: true })
            .select('warehouse_connection_uuid');
        await spaceModel.update(child, {
            warehouseConnectionUuid: original.warehouse_connection_uuid,
        });
        expect(await chartCredentialUser(charts[1])).toBe('original-user');
        await spaceModel.update(child, { warehouseConnectionUuid: null });
        expect(await chartCredentialUser(charts[1])).toBe('space-user');
    });

    test('SQL runner refuses a developer who cannot edit the bound space', async () => {
        await expect(
            service.executeAsyncSqlQuery({
                account,
                projectUuid,
                sql: 'SELECT 1',
                context: QueryExecutionContext.SQL_RUNNER,
                warehouseConnectionUuid: extraConnectionUuid,
            }),
        ).rejects.toThrow(
            new ForbiddenError(
                'This connection is reserved for a space you cannot edit.',
            ),
        );
    });

    test('a parent viewer cannot create a child and gain SQL runner access', async () => {
        await database('space_user_access').insert({
            user_uuid: userUuid,
            space_uuid: spaceA,
            space_role: SpaceMemberRole.VIEWER,
        });
        const spacesBefore = await spaceModel.getChildSpaceUuids(spaceA);
        await expect(
            spaceService.createSpace(projectUuid, account.user, {
                name: 'Escalation child',
                parentSpaceUuid: spaceA,
            }),
        ).rejects.toThrow(
            'You need edit access on a space that uses this connection',
        );
        expect(await spaceModel.getChildSpaceUuids(spaceA)).toEqual(
            spacesBefore,
        );
        await expect(
            service.executeAsyncSqlQuery({
                account,
                projectUuid,
                sql: 'SELECT 1',
                context: QueryExecutionContext.SQL_RUNNER,
                warehouseConnectionUuid: extraConnectionUuid,
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test.each([
        [true, SpaceMemberRole.EDITOR],
        [false, SpaceMemberRole.VIEWER],
    ])(
        'child creation stays available with flag %s and parent role %s',
        async (enabled, role) => {
            await featureFlagModel.upsertOrganizationOverride(
                FeatureFlags.SpaceWarehouseConnections,
                organizationUuid,
                enabled,
            );
            await database('space_user_access').insert({
                user_uuid: userUuid,
                space_uuid: spaceA,
                space_role: role,
            });
            const created = await spaceService.createSpace(
                projectUuid,
                account.user,
                { name: 'Allowed child', parentSpaceUuid: spaceA },
            );
            try {
                expect(created.parentSpaceUuid).toBe(spaceA);
                expect(created.access).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            userUuid,
                            role: SpaceMemberRole.ADMIN,
                        }),
                    ]),
                );
                expect(
                    (
                        await service.getSqlRunnerConnections(
                            account,
                            projectUuid,
                        )
                    ).find(
                        (c) =>
                            c.warehouseConnectionUuid === extraConnectionUuid,
                    )?.canRunSql,
                ).toBe(true);
            } finally {
                await database('space_user_access')
                    .where('space_uuid', created.uuid)
                    .delete();
                await database('spaces')
                    .where('space_uuid', created.uuid)
                    .delete();
            }
        },
    );

    test('a parent viewer cannot move an owned space under a reserved parent', async () => {
        await database('space_user_access').insert([
            {
                user_uuid: userUuid,
                space_uuid: spaceA,
                space_role: SpaceMemberRole.VIEWER,
            },
            {
                user_uuid: userUuid,
                space_uuid: spaceB,
                space_role: SpaceMemberRole.ADMIN,
            },
        ]);
        await expect(
            spaceService.moveToSpace(
                account.user,
                { projectUuid, itemUuid: spaceB, targetSpaceUuid: spaceA },
                { checkForAccess: false },
            ),
        ).rejects.toThrow(
            'You need edit access on a space that uses this connection',
        );
        expect(
            (await spaceModel.getSpaceSummary(spaceB)).parentSpaceUuid,
        ).toBeNull();
    });

    test('SQL runner admits a developer who edits a bound space', async () => {
        await database('space_user_access').insert({
            user_uuid: userUuid,
            space_uuid: spaceA,
            space_role: SpaceMemberRole.EDITOR,
        });
        const admitted = new Error('Reached SQL preparation');
        const preparation = vi
            .spyOn(internals, 'combineParameters')
            .mockRejectedValue(admitted);
        try {
            await expect(
                service.executeAsyncSqlQuery({
                    account,
                    projectUuid,
                    sql: 'SELECT 1',
                    context: QueryExecutionContext.SQL_RUNNER,
                    warehouseConnectionUuid: extraConnectionUuid,
                }),
            ).rejects.toBe(admitted);
            expect(preparation).toHaveBeenCalledOnce();
        } finally {
            preparation.mockRestore();
        }
    });

    test('SQL runner keeps its previous access rule while the flag is disabled', async () => {
        await featureFlagModel.upsertOrganizationOverride(
            FeatureFlags.SpaceWarehouseConnections,
            organizationUuid,
            false,
        );
        const admitted = new Error('Reached SQL preparation');
        const preparation = vi
            .spyOn(internals, 'combineParameters')
            .mockRejectedValue(admitted);
        try {
            await expect(
                service.executeAsyncSqlQuery({
                    account,
                    projectUuid,
                    sql: 'SELECT 1',
                    context: QueryExecutionContext.SQL_RUNNER,
                    warehouseConnectionUuid: extraConnectionUuid,
                }),
            ).rejects.toBe(admitted);
        } finally {
            preparation.mockRestore();
        }
    });

    test('effective bindings identify the closest bound space and its name', async () => {
        const expected = {
            warehouseConnectionUuid: extraConnectionUuid,
            spaceUuid: spaceA,
            spaceName: 'A',
        };
        expect(
            await spaceModel.getEffectiveWarehouseConnectionBinding({
                projectUuid,
                spaceUuid: spaceA,
            }),
        ).toEqual(expected);
        expect(
            await spaceModel.getEffectiveWarehouseConnectionBinding({
                projectUuid,
                spaceUuid: child,
            }),
        ).toEqual(expected);
        expect(
            await spaceModel.getEffectiveWarehouseConnectionBinding({
                projectUuid,
                spaceUuid: spaceB,
            }),
        ).toBeNull();
    });

    test('a viewer sees only the public effective connection metadata', async () => {
        await database('space_user_access').insert({
            user_uuid: userUuid,
            space_uuid: spaceA,
            space_role: SpaceMemberRole.VIEWER,
        });
        const viewer = {
            ...account.user,
            role: OrganizationMemberRole.VIEWER,
            ability: defineUserAbility(
                {
                    organizationUuid,
                    userUuid,
                    role: OrganizationMemberRole.VIEWER,
                },
                [],
            ),
        };
        const expected = {
            warehouseConnectionUuid: extraConnectionUuid,
            name: 'Space connection',
            warehouseType: WarehouseTypes.POSTGRES,
            inheritedFromSpace: null,
        };
        const direct = await spaceService.getSpace(projectUuid, viewer, spaceA);
        expect(direct.effectiveWarehouseConnection).toEqual(expected);
        const inherited = await spaceService.getSpace(
            projectUuid,
            viewer,
            child,
        );
        expect(inherited.effectiveWarehouseConnection).toEqual({
            ...expected,
            inheritedFromSpace: { uuid: spaceA, name: 'A' },
        });
        expect(
            Object.keys(inherited.effectiveWarehouseConnection!).sort(),
        ).toEqual([
            'inheritedFromSpace',
            'name',
            'warehouseConnectionUuid',
            'warehouseType',
        ]);
        expect(
            (await spaceService.getSpace(projectUuid, viewer, spaceB))
                .effectiveWarehouseConnection,
        ).toBeNull();
        await featureFlagModel.upsertOrganizationOverride(
            FeatureFlags.SpaceWarehouseConnections,
            organizationUuid,
            false,
        );
        expect(
            (await spaceService.getSpace(projectUuid, viewer, child))
                .effectiveWarehouseConnection,
        ).toBeNull();
    });

    const catalogCalls = (warehouseConnectionUuid: string) => [
        () =>
            service.getConnectionDatabases(
                account,
                projectUuid,
                warehouseConnectionUuid,
            ),
        () =>
            service.getConnectionTables(
                account,
                projectUuid,
                warehouseConnectionUuid,
                'analytics',
            ),
        () =>
            service.getConnectionTableFields(
                account,
                projectUuid,
                warehouseConnectionUuid,
                {
                    databaseName: 'analytics',
                    schemaName: 'public',
                    tableName: 'orders',
                },
            ),
        () =>
            service.refreshConnectionTables(
                account,
                projectUuid,
                warehouseConnectionUuid,
            ),
    ];

    test('the connection picker and every catalog path refuse a developer without space edit access', async () => {
        const connections = await service.getSqlRunnerConnections(
            account,
            projectUuid,
        );
        expect(
            connections.find(
                (c) => c.warehouseConnectionUuid === extraConnectionUuid,
            )?.canRunSql,
        ).toBe(false);
        expect(
            connections
                .filter(
                    (c) => c.warehouseConnectionUuid !== extraConnectionUuid,
                )
                .every((c) => c.canRunSql),
        ).toBe(true);
        await Promise.all(
            catalogCalls(extraConnectionUuid).map((call) =>
                expect(call()).rejects.toBeInstanceOf(ForbiddenError),
            ),
        );
    });

    test('query estimates refuse a developer without space edit access', async () => {
        await expect(
            service.estimateAsyncSqlQuery({
                account,
                projectUuid,
                sql: 'SELECT 1',
                warehouseConnectionUuid: extraConnectionUuid,
            }),
        ).rejects.toThrow(
            new ForbiddenError(
                'This connection is reserved for a space you cannot edit.',
            ),
        );
    });

    test('a space editor may select the connection and reach every catalog operation', async () => {
        await database('space_user_access').insert({
            user_uuid: userUuid,
            space_uuid: spaceA,
            space_role: SpaceMemberRole.EDITOR,
        });
        expect(
            (await service.getSqlRunnerConnections(account, projectUuid)).find(
                (c) => c.warehouseConnectionUuid === extraConnectionUuid,
            )?.canRunSql,
        ).toBe(true);
        const reachedConnection = new Error('Reached connection loading');
        const getConnection = vi
            .spyOn(warehouseConnectionModel, 'get')
            .mockRejectedValue(reachedConnection);
        try {
            await Promise.all(
                catalogCalls(extraConnectionUuid).map((call) =>
                    expect(call()).rejects.toBe(reachedConnection),
                ),
            );
            expect(getConnection).toHaveBeenCalledTimes(4);
        } finally {
            getConnection.mockRestore();
        }
    });

    test('an editor of only an inheriting child cannot use the parent connection', async () => {
        await database('space_user_access').insert({
            user_uuid: userUuid,
            space_uuid: child,
            space_role: SpaceMemberRole.EDITOR,
        });
        expect(
            (await service.getSqlRunnerConnections(account, projectUuid)).find(
                (c) => c.warehouseConnectionUuid === extraConnectionUuid,
            )?.canRunSql,
        ).toBe(false);
    });

    test('an editor of a child with an override cannot use the parent connection', async () => {
        const [original] = await database('warehouse_connections')
            .where({ project_uuid: projectUuid, is_original: true })
            .select('warehouse_connection_uuid');
        await spaceModel.update(child, {
            warehouseConnectionUuid: original.warehouse_connection_uuid,
        });
        await database('space_user_access').insert({
            user_uuid: userUuid,
            space_uuid: child,
            space_role: SpaceMemberRole.EDITOR,
        });
        try {
            expect(
                (
                    await service.getSqlRunnerConnections(account, projectUuid)
                ).find((c) => c.warehouseConnectionUuid === extraConnectionUuid)
                    ?.canRunSql,
            ).toBe(false);
            expect(
                await spaceModel.getConnectionBoundSpaces({ projectUuid }),
            ).toEqual([
                {
                    spaceUuid: spaceA,
                    warehouseConnectionUuid: extraConnectionUuid,
                },
            ]);
        } finally {
            await spaceModel.update(child, { warehouseConnectionUuid: null });
        }
    });

    test('a space binding never reserves the original connection', async () => {
        const [original] = await database('warehouse_connections')
            .where({ project_uuid: projectUuid, is_original: true })
            .select('warehouse_connection_uuid');
        await spaceModel.update(spaceB, {
            warehouseConnectionUuid: original.warehouse_connection_uuid,
        });
        try {
            expect(
                await spaceModel.getConnectionBoundSpaces({ projectUuid }),
            ).toEqual([
                {
                    spaceUuid: spaceA,
                    warehouseConnectionUuid: extraConnectionUuid,
                },
            ]);
            expect(
                (
                    await service.getSqlRunnerConnections(account, projectUuid)
                ).find((c) => c.isOriginal)?.canRunSql,
            ).toBe(true);
            const reachedConnection = new Error(
                'Reached original connection loading',
            );
            const getConnection = vi
                .spyOn(warehouseConnectionModel, 'get')
                .mockRejectedValue(reachedConnection);
            try {
                await Promise.all(
                    catalogCalls(original.warehouse_connection_uuid).map(
                        (call) =>
                            expect(call()).rejects.toBe(reachedConnection),
                    ),
                );
            } finally {
                getConnection.mockRestore();
            }
        } finally {
            await spaceModel.update(spaceB, { warehouseConnectionUuid: null });
        }
    });

    test('a deleted child cannot expose SQL charts on its inherited reserved connection', async () => {
        const { savedSqlUuid } = await savedSqlModel.create(
            userUuid,
            projectUuid,
            {
                name: 'Restored SQL',
                sql: 'SELECT 1',
                limit: 10,
                spaceUuid: child,
                config: {
                    type: ChartKind.TABLE,
                    columns: {},
                    metadata: { version: 1 },
                },
            } as never,
        );
        try {
            expect(
                await spaceModel.getSqlChartSpaceUuid(
                    projectUuid,
                    savedSqlUuid,
                ),
            ).toBe(child);
            await database('spaces').where('space_uuid', child).update({
                deleted_at: new Date(),
                deleted_by_user_uuid: userUuid,
            });
            expect(await spaceModel.getSqlChartsForSpaceRestore(child)).toEqual(
                [{ spaceUuid: child, warehouseConnectionUuid: null }],
            );
            await expect(
                spaceService.restore(
                    {
                        ...defaultSessionUser,
                        userUuid,
                        organizationUuid,
                        ability: account.user.ability,
                    },
                    child,
                    { bypassPermissions: true },
                ),
            ).rejects.toThrow(
                'This connection is reserved for a space you cannot edit.',
            );
            expect(
                (await database('spaces').where('space_uuid', child).first())
                    ?.deleted_at,
            ).not.toBeNull();
        } finally {
            await database('spaces')
                .where('space_uuid', child)
                .update({ deleted_at: null, deleted_by_user_uuid: null });
            await database('saved_sql')
                .where('saved_sql_uuid', savedSqlUuid)
                .delete();
        }
    });

    test('a bound-space editor with SqlRunner can restore its SQL charts with the binding', async () => {
        const { savedSqlUuid } = await savedSqlModel.create(
            userUuid,
            projectUuid,
            {
                name: 'Bound restore SQL',
                sql: 'SELECT 1',
                limit: 10,
                spaceUuid: spaceA,
                config: {
                    type: ChartKind.TABLE,
                    columns: {},
                    metadata: { version: 1 },
                },
            } as never,
        );
        try {
            await database('space_user_access').insert({
                user_uuid: userUuid,
                space_uuid: spaceA,
                space_role: SpaceMemberRole.EDITOR,
            });
            await database('spaces').where('space_uuid', spaceA).update({
                deleted_at: new Date(),
                deleted_by_user_uuid: userUuid,
            });
            await spaceService.restore(
                {
                    ...defaultSessionUser,
                    userUuid,
                    organizationUuid,
                    ability: account.user.ability,
                },
                spaceA,
                { bypassPermissions: true },
            );
            expect(
                (await database('spaces').where('space_uuid', spaceA).first())
                    ?.deleted_at,
            ).toBeNull();
        } finally {
            await database('spaces')
                .where('space_uuid', spaceA)
                .update({ deleted_at: null, deleted_by_user_uuid: null });
            await database('saved_sql')
                .where('saved_sql_uuid', savedSqlUuid)
                .delete();
        }
    });

    test('deleting a connection clears its space binding', async () => {
        const source = await database('warehouse_connections')
            .where('warehouse_connection_uuid', extraConnectionUuid)
            .first()
            .select('warehouse_type', 'encrypted_credentials');
        if (!source) throw new Error('Missing test connection');
        const [connection] = await database('warehouse_connections')
            .insert({
                project_uuid: projectUuid,
                is_original: false,
                name: 'Disposable connection',
                ...source,
            })
            .returning('warehouse_connection_uuid');
        await spaceModel.update(spaceB, {
            warehouseConnectionUuid: connection.warehouse_connection_uuid,
        });
        await database('warehouse_connections')
            .where(
                'warehouse_connection_uuid',
                connection.warehouse_connection_uuid,
            )
            .delete();
        expect(
            (await spaceModel.getSpaceSummary(spaceB)).warehouseConnectionUuid,
        ).toBeNull();
    });
});
