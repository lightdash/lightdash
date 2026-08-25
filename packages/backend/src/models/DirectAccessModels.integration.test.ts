import {
    ChartKind,
    OrganizationMemberRole,
    ProjectMemberRole,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    AppGroupAccessTableName,
    AppUserAccessTableName,
} from '../database/entities/appAccess';
import { AppsTableName } from '../database/entities/apps';
import {
    DashboardGroupAccessTableName,
    DashboardUserAccessTableName,
} from '../database/entities/dashboardAccess';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import { RolesTableName } from '../database/entities/roles';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import { AppAccessModel } from './AppAccessModel';
import { DashboardAccessModel } from './DashboardAccessModel';
import { type DirectAccess } from './directAccessModelUtils';
import { SavedChartAccessModel } from './SavedChartAccessModel';
import { SavedSqlAccessModel } from './SavedSqlAccessModel';

type AccessModel = {
    getUserAccess(
        resourceUuids: string[],
        userUuid: string,
    ): Promise<Record<string, DirectAccess>>;
};

describe('direct access read models PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: DashboardAccessModel;
    let dashboardUuid: string;
    let savedChartUuid: string;
    let savedSqlUuid: string;
    let appUuid: string;
    let groupUuid: string;
    let userId: number;
    let organizationId: number;
    let organizationUuid: string;
    let projectId: number;
    let projectUuid: string;
    let spaceId: number;
    let spaceUuid: string;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new DashboardAccessModel(transaction);

        const projectSpace = await transaction(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .select(
                `${SpaceTableName}.space_id`,
                `${SpaceTableName}.space_uuid`,
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .first();
        if (!projectSpace) {
            throw new Error('Seed project space not found');
        }
        organizationId = projectSpace.organization_id;
        organizationUuid = projectSpace.organization_uuid;
        projectId = projectSpace.project_id;
        projectUuid = projectSpace.project_uuid;
        spaceId = projectSpace.space_id;
        spaceUuid = projectSpace.space_uuid;

        const user = await transaction(UserTableName)
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .select('user_id')
            .first();
        if (!user) {
            throw new Error('Seed user not found');
        }
        userId = user.user_id;

        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectSpace.project_uuid,
                name: `Direct access dashboard ${randomUUID()}`,
                description: undefined,
                space_id: projectSpace.space_id,
                slug: `direct-access-dashboard-${randomUUID()}`,
            })
            .returning('dashboard_uuid');
        dashboardUuid = dashboard.dashboard_uuid;

        const [savedChart] = await transaction(SavedChartsTableName)
            .insert({
                project_uuid: projectUuid,
                space_id: spaceId,
                dashboard_uuid: null,
                name: `Direct access chart ${randomUUID()}`,
                description: undefined,
                last_version_chart_kind: ChartKind.VERTICAL_BAR,
                last_version_updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                color_palette_uuid: null,
                slug: `direct-access-chart-${randomUUID()}`,
            })
            .returning('saved_query_uuid');
        savedChartUuid = savedChart.saved_query_uuid;

        const [savedSql] = await transaction(SavedSqlTableName)
            .insert({
                project_uuid: projectUuid,
                space_uuid: spaceUuid,
                dashboard_uuid: null,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                name: `Direct access SQL ${randomUUID()}`,
                description: null,
                slug: `direct-access-sql-${randomUUID()}`,
            })
            .returning('saved_sql_uuid');
        savedSqlUuid = savedSql.saved_sql_uuid;

        const [app] = await transaction(AppsTableName)
            .insert({
                project_uuid: projectUuid,
                space_uuid: spaceUuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                name: `Direct access app ${randomUUID()}`,
                description: '',
                slug: `direct-access-app-${randomUUID()}`,
            })
            .returning('app_id');
        appUuid = app.app_id;

        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: projectSpace.organization_id,
                name: `Direct access group ${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('group_uuid');
        groupUuid = group.group_uuid;

        await transaction(GroupMembershipTableName).insert({
            organization_id: projectSpace.organization_id,
            group_uuid: groupUuid,
            user_id: userId,
        });
        await transaction(ProjectGroupAccessTableName).insert({
            project_uuid: projectUuid,
            group_uuid: groupUuid,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(DashboardUserAccessTableName).insert({
            dashboard_uuid: dashboardUuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            space_role: SpaceMemberRole.VIEWER,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(DashboardGroupAccessTableName).insert({
            dashboard_uuid: dashboardUuid,
            group_uuid: groupUuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(SavedChartUserAccessTableName).insert({
            saved_chart_uuid: savedChartUuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            space_role: SpaceMemberRole.VIEWER,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(SavedChartGroupAccessTableName).insert({
            saved_chart_uuid: savedChartUuid,
            group_uuid: groupUuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(SavedSqlUserAccessTableName).insert({
            saved_sql_uuid: savedSqlUuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            space_role: SpaceMemberRole.VIEWER,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(SavedSqlGroupAccessTableName).insert({
            saved_sql_uuid: savedSqlUuid,
            group_uuid: groupUuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(AppUserAccessTableName).insert({
            app_uuid: appUuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            space_role: SpaceMemberRole.VIEWER,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(AppGroupAccessTableName).insert({
            app_uuid: appUuid,
            group_uuid: groupUuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const createMemberPrincipal = async (roleUuid?: string) => {
        const userUuid = randomUUID();
        const [user] = await transaction(UserTableName)
            .insert({
                user_uuid: userUuid,
                first_name: 'Direct',
                last_name: 'Principal',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_id');
        await transaction(OrganizationMembershipsTableName).insert({
            organization_id: organizationId,
            user_id: user.user_id,
            role: OrganizationMemberRole.MEMBER,
            role_uuid: roleUuid,
        });
        await transaction(DashboardUserAccessTableName).insert({
            dashboard_uuid: dashboardUuid,
            user_uuid: userUuid,
            space_role: SpaceMemberRole.EDITOR,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        return { userId: user.user_id, userUuid };
    };

    it('loads every concrete resource in one statement with derived tenancy', async () => {
        const cases: Array<{
            model: AccessModel;
            resourceUuid: string;
            accessTable: string;
        }> = [
            {
                model,
                resourceUuid: dashboardUuid,
                accessTable: DashboardUserAccessTableName,
            },
            {
                model: new SavedChartAccessModel(transaction),
                resourceUuid: savedChartUuid,
                accessTable: SavedChartUserAccessTableName,
            },
            {
                model: new SavedSqlAccessModel(transaction),
                resourceUuid: savedSqlUuid,
                accessTable: SavedSqlUserAccessTableName,
            },
            {
                model: new AppAccessModel(transaction),
                resourceUuid: appUuid,
                accessTable: AppUserAccessTableName,
            },
        ];

        await Promise.all(
            cases.map(async (testCase) => {
                let accessQueryCount = 0;
                const countAccessQueries = ({ sql }: { sql: string }) => {
                    if (sql.includes(testCase.accessTable)) {
                        accessQueryCount += 1;
                    }
                };
                transaction.on('query', countAccessQueries);
                const result = await testCase.model.getUserAccess(
                    [testCase.resourceUuid, testCase.resourceUuid],
                    SEED_ORG_1_ADMIN.user_uuid,
                );
                transaction.removeListener('query', countAccessQueries);

                expect(result[testCase.resourceUuid]).toEqual({
                    organizationUuid,
                    projectUuid,
                    userRole: SpaceMemberRole.VIEWER,
                    groupRoles: [SpaceMemberRole.ADMIN],
                });
                expect(accessQueryCount).toBe(1);
            }),
        );
    });

    it('excludes dashboard-owned chart definitions', async () => {
        const [savedChart] = await transaction(SavedChartsTableName)
            .insert({
                project_uuid: projectUuid,
                space_id: null,
                dashboard_uuid: dashboardUuid,
                name: `Dashboard chart ${randomUUID()}`,
                description: undefined,
                last_version_chart_kind: ChartKind.VERTICAL_BAR,
                last_version_updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                color_palette_uuid: null,
                slug: `dashboard-chart-${randomUUID()}`,
            })
            .returning('saved_query_uuid');
        const [savedSql] = await transaction(SavedSqlTableName)
            .insert({
                project_uuid: projectUuid,
                space_uuid: null,
                dashboard_uuid: dashboardUuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                name: `Dashboard SQL ${randomUUID()}`,
                description: null,
                slug: `dashboard-sql-${randomUUID()}`,
            })
            .returning('saved_sql_uuid');
        await transaction(SavedChartUserAccessTableName).insert({
            saved_chart_uuid: savedChart.saved_query_uuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await transaction(SavedSqlUserAccessTableName).insert({
            saved_sql_uuid: savedSql.saved_sql_uuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        await expect(
            new SavedChartAccessModel(transaction).getUserAccess(
                [savedChart.saved_query_uuid],
                SEED_ORG_1_ADMIN.user_uuid,
            ),
        ).resolves.toEqual({});
        await expect(
            new SavedSqlAccessModel(transaction).getUserAccess(
                [savedSql.saved_sql_uuid],
                SEED_ORG_1_ADMIN.user_uuid,
            ),
        ).resolves.toEqual({});
        await expect(
            new SavedChartAccessModel(transaction).upsertUserAccess({
                resourceUuid: savedChart.saved_query_uuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
        await expect(
            new SavedSqlAccessModel(transaction).upsertUserAccess({
                resourceUuid: savedSql.saved_sql_uuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
    });

    it('makes a group grant inert immediately after membership removal', async () => {
        await transaction(GroupMembershipTableName)
            .where({ group_uuid: groupUuid, user_id: userId })
            .delete();

        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid),
        ).resolves.toMatchObject({
            [dashboardUuid]: {
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [],
            },
        });
    });

    it('makes direct grants inert after project removal or deactivation', async () => {
        const principal = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: principal.userId,
            role: ProjectMemberRole.VIEWER,
        });

        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );

        await transaction(ProjectMembershipsTableName)
            .where({ project_id: projectId, user_id: principal.userId })
            .delete();
        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toEqual({});

        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: principal.userId,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(UserTableName)
            .where('user_id', principal.userId)
            .update({ is_active: false });
        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toEqual({});
    });

    it('accepts current project-group access and invalidates it on removal', async () => {
        const principal = await createMemberPrincipal();
        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
            group_uuid: groupUuid,
            user_id: principal.userId,
        });

        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );

        await transaction(GroupMembershipTableName)
            .where({ group_uuid: groupUuid, user_id: principal.userId })
            .delete();
        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toEqual({});
    });

    it('makes a group grant inert after the group loses project access', async () => {
        const principal = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: principal.userId,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
            group_uuid: groupUuid,
            user_id: principal.userId,
        });

        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toHaveProperty(`${dashboardUuid}.groupRoles`, [
            SpaceMemberRole.ADMIN,
        ]);

        await transaction(ProjectGroupAccessTableName)
            .where({ project_uuid: projectUuid, group_uuid: groupUuid })
            .delete();
        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toHaveProperty(`${dashboardUuid}.groupRoles`, []);
    });

    it('accepts primary and extra organization custom-role access paths', async () => {
        const [role] = await transaction(RolesTableName)
            .insert({
                name: `Direct access role ${randomUUID()}`,
                description: null,
                level: 'organization',
                organization_uuid: organizationUuid,
                created_by: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('role_uuid');
        const principal = await createMemberPrincipal(role.role_uuid);

        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );

        const extraRolePrincipal = await createMemberPrincipal();
        await transaction(OrganizationMembershipCustomRolesTableName).insert({
            organization_id: organizationId,
            user_id: extraRolePrincipal.userId,
            role_uuid: role.role_uuid,
        });
        await expect(
            model.getUserAccess([dashboardUuid], extraRolePrincipal.userUuid),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );
    });

    it('atomically writes and resets grants for every concrete resource', async () => {
        const cases = [
            {
                model: new DashboardAccessModel(transaction),
                resourceUuid: dashboardUuid,
                upsertUser: () =>
                    new DashboardAccessModel(transaction).upsertUserAccess({
                        resourceUuid: dashboardUuid,
                        userUuid: SEED_ORG_1_ADMIN.user_uuid,
                        role: SpaceMemberRole.EDITOR,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                upsertGroup: () =>
                    new DashboardAccessModel(transaction).upsertGroupAccess({
                        resourceUuid: dashboardUuid,
                        groupUuid,
                        role: SpaceMemberRole.VIEWER,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                reset: () =>
                    new DashboardAccessModel(transaction).resetAccess({
                        resourceUuid: dashboardUuid,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    }),
            },
            {
                model: new SavedChartAccessModel(transaction),
                resourceUuid: savedChartUuid,
                upsertUser: () =>
                    new SavedChartAccessModel(transaction).upsertUserAccess({
                        resourceUuid: savedChartUuid,
                        userUuid: SEED_ORG_1_ADMIN.user_uuid,
                        role: SpaceMemberRole.EDITOR,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                upsertGroup: () =>
                    new SavedChartAccessModel(transaction).upsertGroupAccess({
                        resourceUuid: savedChartUuid,
                        groupUuid,
                        role: SpaceMemberRole.VIEWER,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                reset: () =>
                    new SavedChartAccessModel(transaction).resetAccess({
                        resourceUuid: savedChartUuid,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    }),
            },
            {
                model: new SavedSqlAccessModel(transaction),
                resourceUuid: savedSqlUuid,
                upsertUser: () =>
                    new SavedSqlAccessModel(transaction).upsertUserAccess({
                        resourceUuid: savedSqlUuid,
                        userUuid: SEED_ORG_1_ADMIN.user_uuid,
                        role: SpaceMemberRole.EDITOR,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                upsertGroup: () =>
                    new SavedSqlAccessModel(transaction).upsertGroupAccess({
                        resourceUuid: savedSqlUuid,
                        groupUuid,
                        role: SpaceMemberRole.VIEWER,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                reset: () =>
                    new SavedSqlAccessModel(transaction).resetAccess({
                        resourceUuid: savedSqlUuid,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    }),
            },
            {
                model: new AppAccessModel(transaction),
                resourceUuid: appUuid,
                upsertUser: () =>
                    new AppAccessModel(transaction).upsertUserAccess({
                        resourceUuid: appUuid,
                        userUuid: SEED_ORG_1_ADMIN.user_uuid,
                        role: SpaceMemberRole.EDITOR,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                upsertGroup: () =>
                    new AppAccessModel(transaction).upsertGroupAccess({
                        resourceUuid: appUuid,
                        groupUuid,
                        role: SpaceMemberRole.VIEWER,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                        grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    }),
                reset: () =>
                    new AppAccessModel(transaction).resetAccess({
                        resourceUuid: appUuid,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    }),
            },
        ];

        await Promise.all(
            cases.map(async (testCase) => {
                await expect(testCase.upsertUser()).resolves.toMatchObject({
                    organizationUuid,
                    projectUuid,
                    beforeRole: SpaceMemberRole.VIEWER,
                    afterRole: SpaceMemberRole.EDITOR,
                });
                await expect(testCase.upsertGroup()).resolves.toMatchObject({
                    beforeRole: SpaceMemberRole.ADMIN,
                    afterRole: SpaceMemberRole.VIEWER,
                });
                await expect(
                    testCase.model.getUserAccess(
                        [testCase.resourceUuid],
                        SEED_ORG_1_ADMIN.user_uuid,
                    ),
                ).resolves.toMatchObject({
                    [testCase.resourceUuid]: {
                        userRole: SpaceMemberRole.EDITOR,
                        groupRoles: [SpaceMemberRole.VIEWER],
                    },
                });
                await expect(testCase.reset()).resolves.toMatchObject({
                    revokedUsers: 1,
                    revokedGroups: 1,
                });
                await expect(
                    testCase.model.getUserAccess(
                        [testCase.resourceUuid],
                        SEED_ORG_1_ADMIN.user_uuid,
                    ),
                ).resolves.toEqual({});
            }),
        );
    });

    it('rejects unauthorized and cross-tenant writes without revealing targets', async () => {
        let queryCount = 0;
        const countQueries = () => {
            queryCount += 1;
        };
        transaction.on('query', countQueries);
        await expect(
            model.upsertUserAccess({
                resourceUuid: randomUUID(),
                userUuid: randomUUID(),
                role: SpaceMemberRole.ADMIN,
                actorRole: SpaceMemberRole.EDITOR,
                actorRoleResolver: async () => SpaceMemberRole.EDITOR,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
        transaction.removeListener('query', countQueries);
        expect(queryCount).toBe(0);

        await expect(
            model.upsertUserAccess({
                resourceUuid: randomUUID(),
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });

        const [foreignOrganization] = await transaction(OrganizationTableName)
            .insert({ organization_name: `Foreign org ${randomUUID()}` })
            .returning('organization_id');
        const foreignUserUuid = randomUUID();
        const [foreignUser] = await transaction(UserTableName)
            .insert({
                user_uuid: foreignUserUuid,
                first_name: 'Foreign',
                last_name: 'Principal',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_id');
        await transaction(OrganizationMembershipsTableName).insert({
            organization_id: foreignOrganization.organization_id,
            user_id: foreignUser.user_id,
            role: OrganizationMemberRole.ADMIN,
        });
        await expect(
            model.upsertUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: foreignUserUuid,
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
    });

    it('allows self-revoke but prevents an editor from revoking admin access', async () => {
        await expect(
            model.revokeUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                actorRole: SpaceMemberRole.VIEWER,
                actorRoleResolver: async () => SpaceMemberRole.VIEWER,
                actorUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: null,
        });

        await expect(
            model.revokeGroupAccess({
                resourceUuid: dashboardUuid,
                groupUuid,
                actorRole: SpaceMemberRole.EDITOR,
                actorRoleResolver: async () => SpaceMemberRole.EDITOR,
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
        await expect(
            model.upsertGroupAccess({
                resourceUuid: dashboardUuid,
                groupUuid,
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.EDITOR,
                actorRoleResolver: async () => SpaceMemberRole.EDITOR,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
    });

    it('hides resource existence when a self-revoke has no direct grant', async () => {
        const principalUuid = randomUUID();
        const cases = [
            {
                model: new DashboardAccessModel(transaction),
                resourceUuid: dashboardUuid,
            },
            {
                model: new SavedChartAccessModel(transaction),
                resourceUuid: savedChartUuid,
            },
            {
                model: new SavedSqlAccessModel(transaction),
                resourceUuid: savedSqlUuid,
            },
            {
                model: new AppAccessModel(transaction),
                resourceUuid: appUuid,
            },
        ];

        await Promise.all(
            cases.map(({ model: accessModel, resourceUuid }) =>
                expect(
                    accessModel.revokeUserAccess({
                        resourceUuid,
                        userUuid: principalUuid,
                        actorRole: SpaceMemberRole.VIEWER,
                        actorRoleResolver: async () => SpaceMemberRole.VIEWER,
                        actorUserUuid: principalUuid,
                    }),
                ).rejects.toMatchObject({
                    name: 'NotFoundError',
                    message: 'Direct access target not found',
                }),
            ),
        );
        await expect(
            model.revokeUserAccess({
                resourceUuid: randomUUID(),
                userUuid: principalUuid,
                actorRole: SpaceMemberRole.VIEWER,
                actorRoleResolver: async () => SpaceMemberRole.VIEWER,
                actorUserUuid: principalUuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
    });

    it('throws NotFoundError when revoking a missing group grant', async () => {
        const missingGroupUuid = randomUUID();
        const cases = [
            {
                model: new DashboardAccessModel(transaction),
                resourceUuid: dashboardUuid,
            },
            {
                model: new SavedChartAccessModel(transaction),
                resourceUuid: savedChartUuid,
            },
            {
                model: new SavedSqlAccessModel(transaction),
                resourceUuid: savedSqlUuid,
            },
            {
                model: new AppAccessModel(transaction),
                resourceUuid: appUuid,
            },
        ];

        await Promise.all(
            cases.map(({ model: accessModel, resourceUuid }) =>
                expect(
                    accessModel.revokeGroupAccess({
                        resourceUuid,
                        groupUuid: missingGroupUuid,
                        actorRole: SpaceMemberRole.ADMIN,
                        actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    }),
                ).rejects.toMatchObject({
                    name: 'NotFoundError',
                    message: 'Direct access target not found',
                }),
            ),
        );
    });

    it('rolls back a role replacement when grantor attribution is invalid', async () => {
        await expect(
            model.upsertUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.EDITOR,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                grantedByUserUuid: randomUUID(),
            }),
        ).rejects.toBeDefined();

        await expect(
            transaction(DashboardUserAccessTableName)
                .where({
                    dashboard_uuid: dashboardUuid,
                    user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                })
                .first('space_role'),
        ).resolves.toMatchObject({ space_role: SpaceMemberRole.VIEWER });
    });

    it('preserves a grant after its attributed grantor is deleted', async () => {
        const grantor = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: grantor.userId,
            role: ProjectMemberRole.ADMIN,
        });
        await model.upsertUserAccess({
            resourceUuid: dashboardUuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            role: SpaceMemberRole.EDITOR,
            actorRole: SpaceMemberRole.ADMIN,
            actorRoleResolver: async () => SpaceMemberRole.ADMIN,
            grantedByUserUuid: grantor.userUuid,
        });
        await expect(
            transaction(DashboardUserAccessTableName)
                .where({
                    dashboard_uuid: dashboardUuid,
                    user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                })
                .first('granted_by_user_uuid'),
        ).resolves.toMatchObject({
            granted_by_user_uuid: grantor.userUuid,
        });

        await transaction(UserTableName)
            .where('user_uuid', grantor.userUuid)
            .delete();
        await expect(
            transaction(DashboardUserAccessTableName)
                .where({
                    dashboard_uuid: dashboardUuid,
                    user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                })
                .first('granted_by_user_uuid'),
        ).resolves.toMatchObject({ granted_by_user_uuid: null });
    });

    it('holds actor authority locks through the direct mutation', async () => {
        const actor = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: actor.userId,
            role: ProjectMemberRole.ADMIN,
        });
        await transaction.commit();

        const grantBlocker = await database.transaction();
        let downgradeTransaction: Knex.Transaction | undefined;
        let mutation:
            | ReturnType<DashboardAccessModel['upsertUserAccess']>
            | undefined;
        let downgrade: Promise<number> | undefined;

        try {
            await grantBlocker(DashboardUserAccessTableName)
                .where({
                    dashboard_uuid: dashboardUuid,
                    user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                })
                .forUpdate()
                .first();

            let markActorResolved: () => void = () => undefined;
            const actorResolved = new Promise<void>((resolve) => {
                markActorResolved = resolve;
            });
            mutation = new DashboardAccessModel(database).upsertUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.EDITOR,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: async ({ transaction: mutationTrx }) => {
                    const membership = await mutationTrx(
                        ProjectMembershipsTableName,
                    )
                        .where({
                            project_id: projectId,
                            user_id: actor.userId,
                        })
                        .forShare()
                        .first<{ role: SpaceMemberRole }>('role');
                    markActorResolved();
                    return membership?.role;
                },
                grantedByUserUuid: actor.userUuid,
            });

            await actorResolved;
            downgradeTransaction = await database.transaction();
            const backend = await downgradeTransaction.raw<{
                rows: Array<{ pid: number }>;
            }>('SELECT pg_backend_pid() AS pid');
            const [{ pid: downgradePid }] = backend.rows;
            downgrade = downgradeTransaction(ProjectMembershipsTableName)
                .where({ project_id: projectId, user_id: actor.userId })
                .update({ role: ProjectMemberRole.VIEWER })
                .then((updatedRows) => updatedRows);

            const waitForDowngradeLock = async (
                attemptsRemaining: number,
            ): Promise<void> => {
                const activity = await database('pg_stat_activity')
                    .where('pid', downgradePid)
                    .first<{ wait_event_type: string | null }>(
                        'wait_event_type',
                    );
                if (activity?.wait_event_type === 'Lock') {
                    return;
                }
                if (attemptsRemaining === 0) {
                    throw new Error(
                        'Concurrent authority downgrade did not wait on a lock',
                    );
                }
                await new Promise((resolve) => {
                    setTimeout(resolve, 10);
                });
                return waitForDowngradeLock(attemptsRemaining - 1);
            };
            await waitForDowngradeLock(50);

            await grantBlocker.commit();
            await expect(mutation).resolves.toMatchObject({
                afterRole: SpaceMemberRole.EDITOR,
            });
            await downgrade;
            await downgradeTransaction.commit();

            await expect(
                database(DashboardUserAccessTableName)
                    .where({
                        dashboard_uuid: dashboardUuid,
                        user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                    })
                    .first('space_role'),
            ).resolves.toMatchObject({ space_role: SpaceMemberRole.EDITOR });
        } finally {
            if (!grantBlocker.isCompleted()) {
                await grantBlocker.rollback();
            }
            if (mutation !== undefined) {
                await Promise.allSettled([mutation]);
            }
            if (downgrade !== undefined) {
                await Promise.allSettled([downgrade]);
            }
            if (
                downgradeTransaction !== undefined &&
                !downgradeTransaction.isCompleted()
            ) {
                await downgradeTransaction.rollback();
            }
            await database(DashboardsTableName)
                .where('dashboard_uuid', dashboardUuid)
                .delete();
            await database(SavedChartsTableName)
                .where('saved_query_uuid', savedChartUuid)
                .delete();
            await database(SavedSqlTableName)
                .where('saved_sql_uuid', savedSqlUuid)
                .delete();
            await database(AppsTableName).where('app_id', appUuid).delete();
            await database(GroupTableName)
                .where('group_uuid', groupUuid)
                .delete();
            await database(UserTableName)
                .where('user_uuid', actor.userUuid)
                .delete();
        }
    });

    it('serializes concurrent replacements without duplicate rows', async () => {
        await transaction.commit();
        try {
            const committedModel = new DashboardAccessModel(database);
            await Promise.all([
                committedModel.upsertUserAccess({
                    resourceUuid: dashboardUuid,
                    userUuid: SEED_ORG_1_ADMIN.user_uuid,
                    role: SpaceMemberRole.VIEWER,
                    actorRole: SpaceMemberRole.ADMIN,
                    actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                }),
                committedModel.upsertUserAccess({
                    resourceUuid: dashboardUuid,
                    userUuid: SEED_ORG_1_ADMIN.user_uuid,
                    role: SpaceMemberRole.EDITOR,
                    actorRole: SpaceMemberRole.ADMIN,
                    actorRoleResolver: async () => SpaceMemberRole.ADMIN,
                    grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                }),
            ]);
            const rows = await database(DashboardUserAccessTableName).where({
                dashboard_uuid: dashboardUuid,
                user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            });
            expect(rows).toHaveLength(1);
            expect([SpaceMemberRole.VIEWER, SpaceMemberRole.EDITOR]).toContain(
                rows[0].space_role,
            );
        } finally {
            await database(DashboardsTableName)
                .where('dashboard_uuid', dashboardUuid)
                .delete();
            await database(SavedChartsTableName)
                .where('saved_query_uuid', savedChartUuid)
                .delete();
            await database(SavedSqlTableName)
                .where('saved_sql_uuid', savedSqlUuid)
                .delete();
            await database(AppsTableName).where('app_id', appUuid).delete();
            await database(GroupTableName)
                .where('group_uuid', groupUuid)
                .delete();
        }
    });
});
