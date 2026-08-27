import {
    ChartKind,
    DirectAccessOrigin,
    OrganizationMemberRole,
    ProjectMemberRole,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import {
    ProjectTableName,
    type DbProject,
} from '../database/entities/projects';
import { RolesTableName } from '../database/entities/roles';
import {
    SavedChartGroupAccessTableName,
    SavedChartUserAccessTableName,
} from '../database/entities/savedChartAccess';
import { SavedChartsTableName } from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import { SavedChartAccessModel } from './SavedChartAccessModel';

type Fixture = {
    organizationId: number;
    organizationUuid: string;
    projectId: number;
    projectUuid: string;
    spaceId: number;
    spaceUuid: string;
    foreignProjectId: number;
    foreignOrganizationUuid: string;
    foreignUserUuid: string;
    userUuid: string;
    groupUuid: string;
    directChartUuid: string;
    dashboardChartUuid: string;
    deletedChartUuid: string;
    deletedSpaceChartUuid: string;
    deletedDashboardChartUuid: string;
    mismatchedChartUuid: string;
    dualOwnedChartUuid: string;
};

type MutationCase = {
    method: string;
    invoke: (
        resourceUuid: string,
        organizationUuid: string,
    ) => Promise<unknown>;
};

type ChartOwner =
    | { spaceId: number; dashboardUuid: null }
    | { spaceId: null; dashboardUuid: string };

const roles = [
    SpaceMemberRole.VIEWER,
    SpaceMemberRole.EDITOR,
    SpaceMemberRole.ADMIN,
] as const;

const waitForTransactionBlock = async (
    database: Knex,
    blockedPid: number,
    expectedBlockerPid: number,
    deadline: number,
): Promise<boolean> => {
    const {
        rows: [{ blockingPids }],
    } = await database.raw<{ rows: { blockingPids: number[] }[] }>(
        'SELECT pg_blocking_pids(?) AS "blockingPids"',
        [blockedPid],
    );
    if (blockingPids.includes(expectedBlockerPid)) {
        return true;
    }
    if (Date.now() >= deadline) {
        return false;
    }
    await new Promise((resolve) => {
        setTimeout(resolve, 10);
    });
    return waitForTransactionBlock(
        database,
        blockedPid,
        expectedBlockerPid,
        deadline,
    );
};

describe('SavedChartAccessModel PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SavedChartAccessModel;
    let fixture: Fixture;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SavedChartAccessModel(transaction);

        const projectSpace = await transaction(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
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
            .select<{
                spaceId: number;
                spaceUuid: string;
                organizationId: number;
                organizationUuid: string;
                projectId: number;
                projectUuid: string;
                projectType: DbProject['project_type'];
                dbtConnection: DbProject['dbt_connection'];
                dbtConnectionType: DbProject['dbt_connection_type'];
                copiedFromProjectUuid: DbProject['copied_from_project_uuid'];
                dbtVersion: DbProject['dbt_version'];
            }>({
                spaceId: `${SpaceTableName}.space_id`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                projectType: `${ProjectTableName}.project_type`,
                dbtConnection: `${ProjectTableName}.dbt_connection`,
                dbtConnectionType: `${ProjectTableName}.dbt_connection_type`,
                copiedFromProjectUuid: `${ProjectTableName}.copied_from_project_uuid`,
                dbtVersion: `${ProjectTableName}.dbt_version`,
            })
            .first();
        if (projectSpace === undefined) {
            throw new Error('Seed project space not found');
        }

        const foreignOrganization = await transaction(OrganizationTableName)
            .where('organization_uuid', SEED_ORG_2.organization_uuid)
            .first<{ organization_id: number }>('organization_id');
        const foreignAdmin = await transaction(UserTableName)
            .where('user_uuid', SEED_ORG_2_ADMIN.user_uuid)
            .first<{ user_id: number }>('user_id');
        const user = await transaction(UserTableName)
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .first<{ user_id: number }>('user_id');
        if (
            foreignOrganization === undefined ||
            foreignAdmin === undefined ||
            user === undefined
        ) {
            throw new Error('Seed organization or user not found');
        }

        const [foreignProject] = await transaction(ProjectTableName)
            .insert({
                name: `Saved chart access foreign project ${randomUUID()}`,
                organization_id: foreignOrganization.organization_id,
                project_type: projectSpace.projectType,
                dbt_connection: projectSpace.dbtConnection,
                dbt_connection_type: projectSpace.dbtConnectionType,
                copied_from_project_uuid: projectSpace.copiedFromProjectUuid,
                dbt_version: projectSpace.dbtVersion,
                created_by_user_uuid: SEED_ORG_2_ADMIN.user_uuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
        const foreignSpaceSlug = `saved-chart-access-${randomUUID()}`;
        const [foreignSpace] = await transaction(SpaceTableName)
            .insert({
                name: `Saved chart access foreign space ${randomUUID()}`,
                project_id: foreignProject.project_id,
                created_by_user_id: foreignAdmin.user_id,
                slug: foreignSpaceSlug,
                parent_space_uuid: null,
                path: foreignSpaceSlug.replaceAll('-', '_'),
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning('space_id');

        const deletedSpaceSlug = `saved-chart-access-deleted-${randomUUID()}`;
        const [deletedSpace] = await transaction(SpaceTableName)
            .insert({
                name: `Saved chart access deleted space ${randomUUID()}`,
                project_id: projectSpace.projectId,
                created_by_user_id: user.user_id,
                slug: deletedSpaceSlug,
                parent_space_uuid: null,
                path: deletedSpaceSlug.replaceAll('-', '_'),
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning('space_id');

        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectSpace.projectUuid,
                name: `Saved chart access dashboard ${randomUUID()}`,
                description: undefined,
                space_id: projectSpace.spaceId,
                slug: `saved-chart-access-dashboard-${randomUUID()}`,
            })
            .returning('dashboard_uuid');
        const [deletedDashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectSpace.projectUuid,
                name: `Saved chart access deleted dashboard ${randomUUID()}`,
                description: undefined,
                space_id: projectSpace.spaceId,
                slug: `saved-chart-access-deleted-dashboard-${randomUUID()}`,
            })
            .returning('dashboard_uuid');

        const createChart = async (
            chartOwner: ChartOwner & { deleted?: boolean },
        ): Promise<string> => {
            const owner =
                chartOwner.spaceId !== null
                    ? {
                          space_id: chartOwner.spaceId,
                          dashboard_uuid: null,
                      }
                    : {
                          space_id: null,
                          dashboard_uuid: chartOwner.dashboardUuid,
                      };
            const [chart] = await transaction(SavedChartsTableName)
                .insert({
                    project_uuid: projectSpace.projectUuid,
                    ...owner,
                    name: `Saved chart access ${randomUUID()}`,
                    description: undefined,
                    last_version_chart_kind: ChartKind.TABLE,
                    last_version_updated_by_user_uuid:
                        SEED_ORG_1_ADMIN.user_uuid,
                    slug: `saved-chart-access-${randomUUID()}`,
                    color_palette_uuid: null,
                })
                .returning('saved_query_uuid');
            if (chartOwner.deleted) {
                await transaction(SavedChartsTableName)
                    .where('saved_query_uuid', chart.saved_query_uuid)
                    .update({
                        deleted_at: new Date(),
                        deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                    });
            }
            return chart.saved_query_uuid;
        };

        const directChartUuid = await createChart({
            spaceId: projectSpace.spaceId,
            dashboardUuid: null,
        });
        const dashboardChartUuid = await createChart({
            spaceId: null,
            dashboardUuid: dashboard.dashboard_uuid,
        });
        const deletedChartUuid = await createChart({
            spaceId: projectSpace.spaceId,
            dashboardUuid: null,
            deleted: true,
        });
        const deletedSpaceChartUuid = await createChart({
            spaceId: deletedSpace.space_id,
            dashboardUuid: null,
        });
        await transaction(SpaceTableName)
            .where('space_id', deletedSpace.space_id)
            .update({
                deleted_at: new Date(),
                deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            });
        const deletedDashboardChartUuid = await createChart({
            spaceId: null,
            dashboardUuid: deletedDashboard.dashboard_uuid,
        });
        await transaction(DashboardsTableName)
            .where('dashboard_uuid', deletedDashboard.dashboard_uuid)
            .update({
                deleted_at: new Date(),
                deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            });
        const mismatchedChartUuid = await createChart({
            spaceId: foreignSpace.space_id,
            dashboardUuid: null,
        });
        const dualOwnedChartUuid = await createChart({
            spaceId: projectSpace.spaceId,
            dashboardUuid: null,
        });
        await transaction(SavedChartsTableName)
            .where('saved_query_uuid', dualOwnedChartUuid)
            .update({ dashboard_uuid: dashboard.dashboard_uuid });

        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: projectSpace.organizationId,
                name: `Saved chart access group ${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('group_uuid');
        await transaction(GroupMembershipTableName).insert({
            organization_id: projectSpace.organizationId,
            group_uuid: group.group_uuid,
            user_id: user.user_id,
        });
        await transaction(ProjectGroupAccessTableName).insert({
            project_uuid: projectSpace.projectUuid,
            group_uuid: group.group_uuid,
            role: ProjectMemberRole.VIEWER,
        });

        const guardedChartUuids = [
            dashboardChartUuid,
            deletedChartUuid,
            deletedSpaceChartUuid,
            deletedDashboardChartUuid,
            mismatchedChartUuid,
            dualOwnedChartUuid,
        ];
        await transaction(SavedChartUserAccessTableName).insert(
            guardedChartUuids.map((savedChartUuid) => ({
                saved_chart_uuid: savedChartUuid,
                user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })),
        );
        await transaction(SavedChartGroupAccessTableName).insert(
            guardedChartUuids.map((savedChartUuid) => ({
                saved_chart_uuid: savedChartUuid,
                group_uuid: group.group_uuid,
                space_role: SpaceMemberRole.EDITOR,
                granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })),
        );
        await transaction(SavedChartUserAccessTableName).insert({
            saved_chart_uuid: mismatchedChartUuid,
            user_uuid: SEED_ORG_2_ADMIN.user_uuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_2_ADMIN.user_uuid,
        });

        fixture = {
            organizationId: projectSpace.organizationId,
            organizationUuid: projectSpace.organizationUuid,
            projectId: projectSpace.projectId,
            projectUuid: projectSpace.projectUuid,
            spaceId: projectSpace.spaceId,
            spaceUuid: projectSpace.spaceUuid,
            foreignProjectId: foreignProject.project_id,
            foreignOrganizationUuid: SEED_ORG_2.organization_uuid,
            foreignUserUuid: SEED_ORG_2_ADMIN.user_uuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            groupUuid: group.group_uuid,
            directChartUuid,
            dashboardChartUuid,
            deletedChartUuid,
            deletedSpaceChartUuid,
            deletedDashboardChartUuid,
            mismatchedChartUuid,
            dualOwnedChartUuid,
        };
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const upsertUser = (role: SpaceMemberRole) =>
        model.upsertUserAccess({
            resourceUuid: fixture.directChartUuid,
            userUuid: fixture.userUuid,
            role,
            organizationUuid: fixture.organizationUuid,
            grantedByUserUuid: fixture.userUuid,
        });

    const upsertGroup = (role: SpaceMemberRole) =>
        model.upsertGroupAccess({
            resourceUuid: fixture.directChartUuid,
            groupUuid: fixture.groupUuid,
            role,
            organizationUuid: fixture.organizationUuid,
            grantedByUserUuid: fixture.userUuid,
        });

    const getMutationCases = (): MutationCase[] => [
        {
            method: 'upsertUserAccess',
            invoke: (resourceUuid, organizationUuid) =>
                model.upsertUserAccess({
                    resourceUuid,
                    userUuid: fixture.userUuid,
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid,
                    grantedByUserUuid: fixture.userUuid,
                }),
        },
        {
            method: 'upsertGroupAccess',
            invoke: (resourceUuid, organizationUuid) =>
                model.upsertGroupAccess({
                    resourceUuid,
                    groupUuid: fixture.groupUuid,
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid,
                    grantedByUserUuid: fixture.userUuid,
                }),
        },
        {
            method: 'revokeUserAccess',
            invoke: (resourceUuid, organizationUuid) =>
                model.revokeUserAccess({
                    resourceUuid,
                    userUuid: fixture.userUuid,
                    organizationUuid,
                }),
        },
        {
            method: 'revokeGroupAccess',
            invoke: (resourceUuid, organizationUuid) =>
                model.revokeGroupAccess({
                    resourceUuid,
                    groupUuid: fixture.groupUuid,
                    organizationUuid,
                }),
        },
        {
            method: 'resetAccess',
            invoke: (resourceUuid, organizationUuid) =>
                model.resetAccess({ resourceUuid, organizationUuid }),
        },
    ];

    const snapshotAccess = async (resourceUuid: string) => ({
        users: await transaction(SavedChartUserAccessTableName)
            .where('saved_chart_uuid', resourceUuid)
            .select('user_uuid', 'space_role', 'granted_by_user_uuid'),
        groups: await transaction(SavedChartGroupAccessTableName)
            .where('saved_chart_uuid', resourceUuid)
            .select('group_uuid', 'space_role', 'granted_by_user_uuid'),
    });

    const createMemberPrincipal = async ({
        isActive = true,
        roleUuid = null,
    }: {
        isActive?: boolean;
        roleUuid?: string | null;
    } = {}) => {
        const userUuid = randomUUID();
        const [user] = await transaction(UserTableName)
            .insert({
                user_uuid: userUuid,
                first_name: 'Saved chart',
                last_name: 'Principal',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: isActive,
            })
            .returning('user_id');
        await transaction(OrganizationMembershipsTableName).insert({
            organization_id: fixture.organizationId,
            user_id: user.user_id,
            role: OrganizationMemberRole.MEMBER,
            role_uuid: roleUuid,
        });
        return { userId: user.user_id, userUuid };
    };

    const grantUser = (userUuid: string) =>
        model.upsertUserAccess({
            resourceUuid: fixture.directChartUuid,
            userUuid,
            role: SpaceMemberRole.VIEWER,
            organizationUuid: fixture.organizationUuid,
            grantedByUserUuid: fixture.userUuid,
        });

    const createCommittedDirectChart = async (): Promise<string> => {
        const [chart] = await database(SavedChartsTableName)
            .insert({
                project_uuid: fixture.projectUuid,
                space_id: fixture.spaceId,
                dashboard_uuid: null,
                name: `Saved chart access concurrent ${randomUUID()}`,
                description: undefined,
                last_version_chart_kind: ChartKind.TABLE,
                last_version_updated_by_user_uuid: fixture.userUuid,
                slug: `saved-chart-access-concurrent-${randomUUID()}`,
                color_palette_uuid: null,
            })
            .returning('saved_query_uuid');
        return chart.saved_query_uuid;
    };

    it('lists direct principals for independently saved charts only', async () => {
        await upsertUser(SpaceMemberRole.VIEWER);
        await upsertGroup(SpaceMemberRole.EDITOR);

        const { data } = await model.getDirectAccessList(
            fixture.directChartUuid,
            fixture.organizationUuid,
            fixture.projectUuid,
        );
        expect(data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    origin: DirectAccessOrigin.USER,
                    principalUuid: fixture.userUuid,
                    directRole: SpaceMemberRole.VIEWER,
                }),
                expect.objectContaining({
                    origin: DirectAccessOrigin.GROUP,
                    principalUuid: fixture.groupUuid,
                    directRole: SpaceMemberRole.EDITOR,
                }),
            ]),
        );
        await expect(
            model.getGroupRolesForUsers(
                fixture.directChartUuid,
                fixture.organizationUuid,
                fixture.projectUuid,
                [fixture.userUuid],
            ),
        ).resolves.toEqual({
            [fixture.userUuid]: [SpaceMemberRole.EDITOR],
        });
    });

    it('accepts every current project-access path for user principals', async () => {
        const [role] = await transaction(RolesTableName)
            .insert({
                name: `Saved chart access role ${randomUUID()}`,
                description: null,
                level: 'organization',
                organization_uuid: fixture.organizationUuid,
                created_by: fixture.userUuid,
            })
            .returning('role_uuid');
        const directProjectPrincipal = await createMemberPrincipal();
        const projectGroupPrincipal = await createMemberPrincipal();
        const primaryCustomRolePrincipal = await createMemberPrincipal({
            roleUuid: role.role_uuid,
        });
        const extraCustomRolePrincipal = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: fixture.projectId,
            user_id: directProjectPrincipal.userId,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(GroupMembershipTableName).insert({
            organization_id: fixture.organizationId,
            group_uuid: fixture.groupUuid,
            user_id: projectGroupPrincipal.userId,
        });
        await transaction(OrganizationMembershipCustomRolesTableName).insert({
            organization_id: fixture.organizationId,
            user_id: extraCustomRolePrincipal.userId,
            role_uuid: role.role_uuid,
        });

        const expectedResult = {
            organizationId: fixture.organizationId,
            organizationUuid: fixture.organizationUuid,
            projectId: fixture.projectId,
            projectUuid: fixture.projectUuid,
            beforeRole: null,
            afterRole: SpaceMemberRole.VIEWER,
        };
        await expect(
            grantUser(directProjectPrincipal.userUuid),
        ).resolves.toEqual(expectedResult);
        await expect(
            grantUser(projectGroupPrincipal.userUuid),
        ).resolves.toEqual(expectedResult);
        await expect(
            grantUser(primaryCustomRolePrincipal.userUuid),
        ).resolves.toEqual(expectedResult);
        await expect(
            grantUser(extraCustomRolePrincipal.userUuid),
        ).resolves.toEqual(expectedResult);

        const principalUuids = [
            directProjectPrincipal.userUuid,
            projectGroupPrincipal.userUuid,
            primaryCustomRolePrincipal.userUuid,
            extraCustomRolePrincipal.userUuid,
        ];
        const rows = await transaction(SavedChartUserAccessTableName)
            .where('saved_chart_uuid', fixture.directChartUuid)
            .whereIn('user_uuid', principalUuids)
            .select('user_uuid', 'space_role');
        expect(rows).toHaveLength(principalUuids.length);
        expect(rows).toEqual(
            expect.arrayContaining(
                principalUuids.map((userUuid) => ({
                    user_uuid: userUuid,
                    space_role: SpaceMemberRole.VIEWER,
                })),
            ),
        );
    });

    it('rejects invalid user and group principals without writes', async () => {
        const noProjectPrincipal = await createMemberPrincipal();
        const inactivePrincipal = await createMemberPrincipal({
            isActive: false,
        });
        await transaction(ProjectMembershipsTableName).insert({
            project_id: fixture.projectId,
            user_id: inactivePrincipal.userId,
            role: ProjectMemberRole.VIEWER,
        });
        const [noProjectGroup] = await transaction(GroupTableName)
            .insert({
                organization_id: fixture.organizationId,
                name: `Saved chart access no-project group ${randomUUID()}`,
                created_by_user_uuid: fixture.userUuid,
                updated_by_user_uuid: fixture.userUuid,
            })
            .returning('group_uuid');

        await expect(grantUser(randomUUID())).rejects.toMatchObject({
            name: 'NotFoundError',
        });
        await expect(
            grantUser(noProjectPrincipal.userUuid),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
        });
        await expect(
            grantUser(inactivePrincipal.userUuid),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
        });
        await expect(grantUser(fixture.foreignUserUuid)).rejects.toMatchObject({
            name: 'NotFoundError',
        });
        await expect(
            model.upsertGroupAccess({
                resourceUuid: fixture.directChartUuid,
                groupUuid: noProjectGroup.group_uuid,
                role: SpaceMemberRole.VIEWER,
                organizationUuid: fixture.organizationUuid,
                grantedByUserUuid: fixture.userUuid,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
        await expect(snapshotAccess(fixture.directChartUuid)).resolves.toEqual({
            users: [],
            groups: [],
        });
    });

    it('makes user and group grants inert when project access is lost', async () => {
        const directPrincipal = await createMemberPrincipal();
        const groupPrincipal = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert([
            {
                project_id: fixture.projectId,
                user_id: directPrincipal.userId,
                role: ProjectMemberRole.VIEWER,
            },
            {
                project_id: fixture.projectId,
                user_id: groupPrincipal.userId,
                role: ProjectMemberRole.VIEWER,
            },
        ]);
        await transaction(GroupMembershipTableName).insert({
            organization_id: fixture.organizationId,
            group_uuid: fixture.groupUuid,
            user_id: groupPrincipal.userId,
        });
        await grantUser(directPrincipal.userUuid);
        await upsertGroup(SpaceMemberRole.EDITOR);

        await transaction(ProjectMembershipsTableName)
            .where({
                project_id: fixture.projectId,
                user_id: directPrincipal.userId,
            })
            .delete();
        await expect(
            model.getUserAccess(
                [fixture.directChartUuid],
                directPrincipal.userUuid,
                { organizationUuid: fixture.organizationUuid },
            ),
        ).resolves.toEqual({});

        await transaction(ProjectGroupAccessTableName)
            .where({
                project_uuid: fixture.projectUuid,
                group_uuid: fixture.groupUuid,
            })
            .delete();
        await expect(
            model.getUserAccess(
                [fixture.directChartUuid],
                groupPrincipal.userUuid,
                { organizationUuid: fixture.organizationUuid },
            ),
        ).resolves.toEqual({});

        await transaction(ProjectMembershipsTableName).insert({
            project_id: fixture.projectId,
            user_id: directPrincipal.userId,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(UserTableName)
            .where('user_id', directPrincipal.userId)
            .update({ is_active: false });
        await expect(
            model.getUserAccess(
                [fixture.directChartUuid],
                directPrincipal.userUuid,
                { organizationUuid: fixture.organizationUuid },
            ),
        ).resolves.toEqual({});
    });

    it.each(roles)('upserts and reads a %s user grant', async (role) => {
        await expect(upsertUser(role)).resolves.toEqual({
            organizationId: fixture.organizationId,
            organizationUuid: fixture.organizationUuid,
            projectId: fixture.projectId,
            projectUuid: fixture.projectUuid,
            beforeRole: null,
            afterRole: role,
        });
        await expect(
            model.getUserAccess([fixture.directChartUuid], fixture.userUuid, {
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toEqual({
            [fixture.directChartUuid]: {
                organizationUuid: fixture.organizationUuid,
                projectUuid: fixture.projectUuid,
                spaceUuid: fixture.spaceUuid,
                userRole: role,
                groupRoles: [],
            },
        });
    });

    it.each(roles)('upserts and reads a %s group grant', async (role) => {
        await expect(upsertGroup(role)).resolves.toMatchObject({
            beforeRole: null,
            afterRole: role,
        });
        await expect(
            model.getUserAccess([fixture.directChartUuid], fixture.userUuid, {
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toHaveProperty(`${fixture.directChartUuid}.groupRoles`, [
            role,
        ]);
    });

    it('reports the previous user role when replacing a grant', async () => {
        await upsertUser(SpaceMemberRole.VIEWER);

        await expect(
            model.upsertUserAccess({
                resourceUuid: fixture.directChartUuid,
                userUuid: fixture.userUuid,
                role: SpaceMemberRole.ADMIN,
                organizationUuid: fixture.organizationUuid,
                grantedByUserUuid: fixture.foreignUserUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: SpaceMemberRole.ADMIN,
        });
        await expect(
            transaction(SavedChartUserAccessTableName).where({
                saved_chart_uuid: fixture.directChartUuid,
                user_uuid: fixture.userUuid,
            }),
        ).resolves.toEqual([
            expect.objectContaining({
                space_role: SpaceMemberRole.ADMIN,
                granted_by_user_uuid: fixture.foreignUserUuid,
            }),
        ]);
    });

    it('reports the previous group role when replacing a grant', async () => {
        await upsertGroup(SpaceMemberRole.VIEWER);

        await expect(
            model.upsertGroupAccess({
                resourceUuid: fixture.directChartUuid,
                groupUuid: fixture.groupUuid,
                role: SpaceMemberRole.EDITOR,
                organizationUuid: fixture.organizationUuid,
                grantedByUserUuid: fixture.foreignUserUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: SpaceMemberRole.EDITOR,
        });
        await expect(
            transaction(SavedChartGroupAccessTableName).where({
                saved_chart_uuid: fixture.directChartUuid,
                group_uuid: fixture.groupUuid,
            }),
        ).resolves.toEqual([
            expect.objectContaining({
                space_role: SpaceMemberRole.EDITOR,
                granted_by_user_uuid: fixture.foreignUserUuid,
            }),
        ]);
    });

    it('keeps user revocation idempotent', async () => {
        await upsertUser(SpaceMemberRole.EDITOR);

        await expect(
            model.revokeUserAccess({
                resourceUuid: fixture.directChartUuid,
                userUuid: fixture.userUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.EDITOR,
            afterRole: null,
        });
        await expect(
            model.revokeUserAccess({
                resourceUuid: fixture.directChartUuid,
                userUuid: fixture.userUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({ beforeRole: null, afterRole: null });
    });

    it('keeps group revocation idempotent', async () => {
        await upsertGroup(SpaceMemberRole.ADMIN);

        await expect(
            model.revokeGroupAccess({
                resourceUuid: fixture.directChartUuid,
                groupUuid: fixture.groupUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.ADMIN,
            afterRole: null,
        });
        await expect(
            model.revokeGroupAccess({
                resourceUuid: fixture.directChartUuid,
                groupUuid: fixture.groupUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({ beforeRole: null, afterRole: null });
    });

    it('reports reset counts and keeps a second reset idempotent', async () => {
        await upsertUser(SpaceMemberRole.EDITOR);
        await upsertGroup(SpaceMemberRole.ADMIN);

        await expect(
            model.resetAccess({
                resourceUuid: fixture.directChartUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({ revokedUsers: 1, revokedGroups: 1 });
        await expect(
            model.resetAccess({
                resourceUuid: fixture.directChartUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({ revokedUsers: 0, revokedGroups: 0 });
    });

    const boundaryCases = [
        {
            boundary: 'wrong organization',
            resourceUuid: () => fixture.directChartUuid,
            organizationUuid: () => fixture.foreignOrganizationUuid,
        },
        {
            boundary: 'unknown chart',
            resourceUuid: () => randomUUID(),
            organizationUuid: () => fixture.organizationUuid,
        },
        {
            boundary: 'deleted chart',
            resourceUuid: () => fixture.deletedChartUuid,
            organizationUuid: () => fixture.organizationUuid,
        },
        {
            boundary: 'chart in a deleted owner space',
            resourceUuid: () => fixture.deletedSpaceChartUuid,
            organizationUuid: () => fixture.organizationUuid,
        },
        {
            boundary: 'chart in a deleted owner dashboard',
            resourceUuid: () => fixture.deletedDashboardChartUuid,
            organizationUuid: () => fixture.organizationUuid,
        },
        {
            boundary: 'mismatched chart from stored project tenant',
            resourceUuid: () => fixture.mismatchedChartUuid,
            organizationUuid: () => fixture.organizationUuid,
        },
        {
            boundary: 'mismatched chart from owner-space tenant',
            resourceUuid: () => fixture.mismatchedChartUuid,
            organizationUuid: () => fixture.foreignOrganizationUuid,
        },
    ];

    it.each(
        boundaryCases.flatMap((boundary) =>
            getMutationCases().map((mutation) => ({
                ...boundary,
                ...mutation,
            })),
        ),
    )('$method rejects a $boundary without side effects', async (testCase) => {
        const resourceUuid = testCase.resourceUuid();
        const organizationUuid = testCase.organizationUuid();
        const before = await snapshotAccess(resourceUuid);

        await expect(
            testCase.invoke(resourceUuid, organizationUuid),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
        await expect(snapshotAccess(resourceUuid)).resolves.toEqual(before);
    });

    it('keeps grants inert for mismatched and dual ownership rows', async () => {
        await expect(
            model.getUserAccess(
                [fixture.mismatchedChartUuid],
                fixture.foreignUserUuid,
                { organizationUuid: fixture.foreignOrganizationUuid },
            ),
        ).resolves.toEqual({});
        await expect(
            model.getUserAccess(
                [fixture.dualOwnedChartUuid],
                fixture.userUuid,
                { organizationUuid: fixture.organizationUuid },
            ),
        ).resolves.toEqual({});
    });

    it.each([
        {
            method: 'upsertUserAccess',
            invoke: () =>
                model.upsertUserAccess({
                    resourceUuid: fixture.dashboardChartUuid,
                    userUuid: fixture.userUuid,
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid: fixture.organizationUuid,
                    grantedByUserUuid: fixture.userUuid,
                }),
        },
        {
            method: 'upsertGroupAccess',
            invoke: () =>
                model.upsertGroupAccess({
                    resourceUuid: fixture.dashboardChartUuid,
                    groupUuid: fixture.groupUuid,
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid: fixture.organizationUuid,
                    grantedByUserUuid: fixture.userUuid,
                }),
        },
    ])('$method rejects a dashboard-owned chart', async (testCase) => {
        const before = await snapshotAccess(fixture.dashboardChartUuid);

        await expect(testCase.invoke()).rejects.toMatchObject({
            name: 'ParameterError',
        });
        await expect(
            snapshotAccess(fixture.dashboardChartUuid),
        ).resolves.toEqual(before);
    });

    it.each([
        {
            method: 'upsertUserAccess',
            invoke: () =>
                model.upsertUserAccess({
                    resourceUuid: fixture.dualOwnedChartUuid,
                    userUuid: fixture.userUuid,
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid: fixture.organizationUuid,
                    grantedByUserUuid: fixture.userUuid,
                }),
        },
        {
            method: 'upsertGroupAccess',
            invoke: () =>
                model.upsertGroupAccess({
                    resourceUuid: fixture.dualOwnedChartUuid,
                    groupUuid: fixture.groupUuid,
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid: fixture.organizationUuid,
                    grantedByUserUuid: fixture.userUuid,
                }),
        },
    ])('$method rejects a dual-owned chart', async (testCase) => {
        const before = await snapshotAccess(fixture.dualOwnedChartUuid);

        await expect(testCase.invoke()).rejects.toMatchObject({
            name: 'ParameterError',
        });
        await expect(
            snapshotAccess(fixture.dualOwnedChartUuid),
        ).resolves.toEqual(before);
    });

    it('revokes stale user access from a dashboard-owned chart', async () => {
        await expect(
            model.revokeUserAccess({
                resourceUuid: fixture.dashboardChartUuid,
                userUuid: fixture.userUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: null,
        });
        await expect(
            transaction(SavedChartUserAccessTableName).where({
                saved_chart_uuid: fixture.dashboardChartUuid,
                user_uuid: fixture.userUuid,
            }),
        ).resolves.toHaveLength(0);
    });

    it('revokes stale group access from a dashboard-owned chart', async () => {
        await expect(
            model.revokeGroupAccess({
                resourceUuid: fixture.dashboardChartUuid,
                groupUuid: fixture.groupUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.EDITOR,
            afterRole: null,
        });
        await expect(
            transaction(SavedChartGroupAccessTableName).where({
                saved_chart_uuid: fixture.dashboardChartUuid,
                group_uuid: fixture.groupUuid,
            }),
        ).resolves.toHaveLength(0);
    });

    it('resets stale access on a dashboard-owned chart', async () => {
        await expect(
            model.resetAccess({
                resourceUuid: fixture.dashboardChartUuid,
                organizationUuid: fixture.organizationUuid,
            }),
        ).resolves.toMatchObject({ revokedUsers: 1, revokedGroups: 1 });
        await expect(
            snapshotAccess(fixture.dashboardChartUuid),
        ).resolves.toEqual({ users: [], groups: [] });
    });

    it('serializes concurrent grants and reports the committed previous role', async () => {
        let chartUuid: string | undefined;
        let firstTransaction: Knex.Transaction | undefined;
        let secondTransaction: Knex.Transaction | undefined;
        let secondMutation: Promise<unknown> | undefined;

        try {
            chartUuid = await createCommittedDirectChart();
            firstTransaction = await database.transaction();
            secondTransaction = await database.transaction();
            const firstModel = new SavedChartAccessModel(firstTransaction);
            const secondModel = new SavedChartAccessModel(secondTransaction);
            const [firstPidResult, secondPidResult] = await Promise.all([
                firstTransaction.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                ),
                secondTransaction.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                ),
            ]);
            const [{ pid: firstPid }] = firstPidResult.rows;
            const [{ pid: secondPid }] = secondPidResult.rows;
            await firstModel.upsertUserAccess({
                resourceUuid: chartUuid,
                userUuid: fixture.userUuid,
                role: SpaceMemberRole.VIEWER,
                organizationUuid: fixture.organizationUuid,
                grantedByUserUuid: fixture.userUuid,
            });

            secondMutation = secondModel.upsertUserAccess({
                resourceUuid: chartUuid,
                userUuid: fixture.userUuid,
                role: SpaceMemberRole.ADMIN,
                organizationUuid: fixture.organizationUuid,
                grantedByUserUuid: fixture.userUuid,
            });

            await expect(
                waitForTransactionBlock(
                    database,
                    secondPid,
                    firstPid,
                    Date.now() + 5_000,
                ),
            ).resolves.toBe(true);

            await firstTransaction.commit();
            await expect(secondMutation).resolves.toMatchObject({
                beforeRole: SpaceMemberRole.VIEWER,
                afterRole: SpaceMemberRole.ADMIN,
            });
            await secondTransaction.commit();

            await expect(
                database(SavedChartUserAccessTableName).where({
                    saved_chart_uuid: chartUuid,
                    user_uuid: fixture.userUuid,
                    space_role: SpaceMemberRole.ADMIN,
                }),
            ).resolves.toHaveLength(1);
        } finally {
            if (
                firstTransaction !== undefined &&
                !firstTransaction.isCompleted()
            ) {
                await firstTransaction.rollback();
            }
            if (secondMutation !== undefined) {
                await secondMutation.catch(() => undefined);
            }
            if (
                secondTransaction !== undefined &&
                !secondTransaction.isCompleted()
            ) {
                await secondTransaction.rollback();
            }
            if (chartUuid !== undefined) {
                await database(SavedChartUserAccessTableName)
                    .where('saved_chart_uuid', chartUuid)
                    .delete();
                await database(SavedChartsTableName)
                    .where('saved_query_uuid', chartUuid)
                    .delete();
            }
        }
    }, 15_000);

    it('holds the owner-space chain stable until a grant commits', async () => {
        let chartUuid: string | undefined;
        let grantTransaction: Knex.Transaction | undefined;
        let ownerTransaction: Knex.Transaction | undefined;
        let ownerUpdate: Promise<number | null> | undefined;

        try {
            chartUuid = await createCommittedDirectChart();
            grantTransaction = await database.transaction();
            ownerTransaction = await database.transaction();
            const grantModel = new SavedChartAccessModel(grantTransaction);
            const [grantPidResult, ownerPidResult] = await Promise.all([
                grantTransaction.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                ),
                ownerTransaction.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                ),
            ]);
            const [{ pid: grantPid }] = grantPidResult.rows;
            const [{ pid: ownerPid }] = ownerPidResult.rows;

            await new SavedChartAccessModel(grantTransaction).upsertUserAccess({
                resourceUuid: chartUuid,
                userUuid: fixture.userUuid,
                role: SpaceMemberRole.VIEWER,
                organizationUuid: fixture.organizationUuid,
                grantedByUserUuid: fixture.userUuid,
            });
            ownerUpdate = ownerTransaction
                .raw<{ rowCount: number | null }>(
                    'UPDATE spaces SET project_id = project_id WHERE space_id = ?',
                    [fixture.spaceId],
                )
                .then(({ rowCount }) => rowCount);

            await expect(
                waitForTransactionBlock(
                    database,
                    ownerPid,
                    grantPid,
                    Date.now() + 5_000,
                ),
            ).resolves.toBe(true);

            await grantTransaction.commit();
            await expect(ownerUpdate).resolves.toBe(1);
            await ownerTransaction.rollback();
        } finally {
            if (
                grantTransaction !== undefined &&
                !grantTransaction.isCompleted()
            ) {
                await grantTransaction.rollback();
            }
            if (ownerUpdate !== undefined) {
                await ownerUpdate.catch(() => undefined);
            }
            if (
                ownerTransaction !== undefined &&
                !ownerTransaction.isCompleted()
            ) {
                await ownerTransaction.rollback();
            }
            if (chartUuid !== undefined) {
                await database(SavedChartUserAccessTableName)
                    .where('saved_chart_uuid', chartUuid)
                    .delete();
                await database(SavedChartsTableName)
                    .where('saved_query_uuid', chartUuid)
                    .delete();
            }
        }
    }, 15_000);
});
