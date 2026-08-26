import {
    OrganizationMemberRole,
    ProjectMemberRole,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
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
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import { DashboardAccessModel } from './DashboardAccessModel';

describe('dashboard direct access model PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: DashboardAccessModel;
    let dashboardUuid: string;
    let groupUuid: string;
    let userId: number;
    let organizationId: number;
    let organizationUuid: string;
    let projectId: number;
    let projectUuid: string;

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
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .select(
                `${SpaceTableName}.space_id`,
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .first();
        if (!projectSpace) {
            throw new Error('Seed project space not found');
        }
        organizationId = projectSpace.organization_id;
        organizationUuid = projectSpace.organization_uuid;
        projectId = projectSpace.project_id;
        projectUuid = projectSpace.project_uuid;

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

        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: organizationId,
                name: `Direct access group ${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('group_uuid');
        groupUuid = group.group_uuid;

        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
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

    it('resolves direct user and current group roles with derived tenancy', async () => {
        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({
            [dashboardUuid]: {
                organizationUuid,
                projectUuid,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.ADMIN],
            },
        });
    });

    it('makes a group grant inert immediately after membership removal', async () => {
        await transaction(GroupMembershipTableName)
            .where({ group_uuid: groupUuid, user_id: userId })
            .delete();

        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toMatchObject({
            [dashboardUuid]: {
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [],
            },
        });
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
            model.getUserAccess([dashboardUuid], principal.userUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(`${dashboardUuid}.groupRoles`, [
            SpaceMemberRole.ADMIN,
        ]);

        await transaction(ProjectGroupAccessTableName)
            .where({ project_uuid: projectUuid, group_uuid: groupUuid })
            .delete();
        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(`${dashboardUuid}.groupRoles`, []);
    });

    it('makes direct grants inert after project removal or deactivation', async () => {
        const principal = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: principal.userId,
            role: ProjectMemberRole.VIEWER,
        });

        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );

        await transaction(ProjectMembershipsTableName)
            .where({ project_id: projectId, user_id: principal.userId })
            .delete();
        await expect(
            model.getUserAccess([dashboardUuid], principal.userUuid, {
                organizationUuid,
            }),
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
            model.getUserAccess([dashboardUuid], principal.userUuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
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
            model.getUserAccess([dashboardUuid], principal.userUuid, {
                organizationUuid,
            }),
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
            model.getUserAccess([dashboardUuid], extraRolePrincipal.userUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );
    });

    it('scopes reads and writes to the expected organization', async () => {
        const wrongOrganizationUuid = randomUUID();

        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid: wrongOrganizationUuid,
            }),
        ).resolves.toEqual({});

        await expect(
            model.upsertUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.EDITOR,
                organizationUuid: wrongOrganizationUuid,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
        await expect(
            model.resetAccess({
                resourceUuid: dashboardUuid,
                organizationUuid: wrongOrganizationUuid,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
        await expect(
            model.revokeUserAccess({
                resourceUuid: randomUUID(),
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                organizationUuid,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
    });

    it('upserts, replaces, and resets grants', async () => {
        const principal = await createMemberPrincipal();
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: principal.userId,
            role: ProjectMemberRole.VIEWER,
        });

        await expect(
            model.upsertUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: principal.userUuid,
                role: SpaceMemberRole.ADMIN,
                organizationUuid,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.EDITOR,
            afterRole: SpaceMemberRole.ADMIN,
            organizationUuid,
            projectUuid,
        });
        const rows = await transaction(DashboardUserAccessTableName).where({
            dashboard_uuid: dashboardUuid,
            user_uuid: principal.userUuid,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].space_role).toBe(SpaceMemberRole.ADMIN);

        await expect(
            model.upsertGroupAccess({
                resourceUuid: dashboardUuid,
                groupUuid,
                role: SpaceMemberRole.EDITOR,
                organizationUuid,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.ADMIN,
            afterRole: SpaceMemberRole.EDITOR,
        });

        await expect(
            model.resetAccess({
                resourceUuid: dashboardUuid,
                organizationUuid,
            }),
        ).resolves.toMatchObject({ revokedUsers: 2, revokedGroups: 1 });
        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
    });

    it('rejects grants to principals without current project access', async () => {
        await expect(
            model.upsertUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: randomUUID(),
                role: SpaceMemberRole.VIEWER,
                organizationUuid,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });

        const [foreignGroup] = await transaction(GroupTableName)
            .insert({
                organization_id: organizationId,
                name: `No project access ${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('group_uuid');
        await expect(
            model.upsertGroupAccess({
                resourceUuid: dashboardUuid,
                groupUuid: foreignGroup.group_uuid,
                role: SpaceMemberRole.VIEWER,
                organizationUuid,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
    });

    it('makes revokes of missing grants idempotent', async () => {
        await expect(
            model.revokeUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: randomUUID(),
                organizationUuid,
            }),
        ).resolves.toMatchObject({ beforeRole: null, afterRole: null });
        await expect(
            model.revokeGroupAccess({
                resourceUuid: dashboardUuid,
                groupUuid: randomUUID(),
                organizationUuid,
            }),
        ).resolves.toMatchObject({ beforeRole: null, afterRole: null });

        await expect(
            model.revokeUserAccess({
                resourceUuid: dashboardUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                organizationUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: null,
        });
        await expect(
            model.revokeGroupAccess({
                resourceUuid: dashboardUuid,
                groupUuid,
                organizationUuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.ADMIN,
            afterRole: null,
        });
        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
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
            organizationUuid,
            grantedByUserUuid: grantor.userUuid,
        });

        await transaction(DashboardUserAccessTableName)
            .where('user_uuid', grantor.userUuid)
            .delete();
        await transaction(OrganizationMembershipsTableName)
            .where('user_id', grantor.userId)
            .delete();
        await transaction(ProjectMembershipsTableName)
            .where('user_id', grantor.userId)
            .delete();
        await transaction(UserTableName)
            .where('user_id', grantor.userId)
            .delete();

        const [row] = await transaction(DashboardUserAccessTableName).where({
            dashboard_uuid: dashboardUuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        expect(row.space_role).toBe(SpaceMemberRole.EDITOR);
        expect(row.granted_by_user_uuid).toBeNull();
        await expect(
            model.getUserAccess([dashboardUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(
            `${dashboardUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );
    });
});
