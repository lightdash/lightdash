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
});
