import {
    DirectAccessOrigin,
    OrganizationMemberRole,
    ProjectMemberRole,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    SpaceMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DashboardsTableName } from '../database/entities/dashboards';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import { SavedSqlAccessModel } from './SavedSqlAccessModel';

describe('saved SQL direct access model PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SavedSqlAccessModel;
    let savedSqlUuid: string;
    let spaceUuid: string;
    let spaceId: number;
    let groupUuid: string;
    let userId: number;
    let organizationId: number;
    let organizationUuid: string;
    let projectId: number;
    let projectUuid: string;

    const mutationExpectation = () => ({
        organizationUuid,
        projectUuid,
        spaceUuid,
        dashboardUuid: null,
    });

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SavedSqlAccessModel(transaction);

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
                `${SpaceTableName}.space_uuid`,
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .first();
        if (!projectSpace) {
            throw new Error('Seed project space not found');
        }
        spaceId = projectSpace.space_id;
        spaceUuid = projectSpace.space_uuid;
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

        const [savedSql] = await transaction(SavedSqlTableName)
            .insert({
                project_uuid: projectUuid,
                space_uuid: spaceUuid,
                dashboard_uuid: null,
                name: `Direct access SQL chart ${randomUUID()}`,
                description: null,
                slug: `direct-access-sql-${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('saved_sql_uuid');
        savedSqlUuid = savedSql.saved_sql_uuid;

        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: organizationId,
                name: `Direct access SQL group ${randomUUID()}`,
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
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    it('upserts, lists, resolves, revokes, and resets user and group grants', async () => {
        await expect(
            model.upsertUserAccess({
                resourceUuid: savedSqlUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                ...mutationExpectation(),
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: null,
            afterRole: SpaceMemberRole.VIEWER,
            organizationUuid,
            projectUuid,
        });
        await model.upsertGroupAccess({
            resourceUuid: savedSqlUuid,
            groupUuid,
            role: SpaceMemberRole.ADMIN,
            ...mutationExpectation(),
            grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        await expect(
            model.getUserAccess([savedSqlUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({
            [savedSqlUuid]: {
                organizationUuid,
                projectUuid,
                spaceUuid,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.ADMIN],
            },
        });
        await expect(
            model.getGroupRolesForUsers(
                savedSqlUuid,
                [SEED_ORG_1_ADMIN.user_uuid],
                organizationUuid,
            ),
        ).resolves.toEqual({
            [SEED_ORG_1_ADMIN.user_uuid]: [SpaceMemberRole.ADMIN],
        });

        const list = await model.getDirectAccessList(
            savedSqlUuid,
            organizationUuid,
            {
                paginateArgs: { page: 1, pageSize: 1 },
                searchQuery: 'David',
            },
        );
        expect(list.data).toHaveLength(1);
        expect(list.data[0]).toMatchObject({
            origin: DirectAccessOrigin.USER,
            principalUuid: SEED_ORG_1_ADMIN.user_uuid,
            directRole: SpaceMemberRole.VIEWER,
        });
        expect(list.pagination?.totalResults).toBe(1);

        await expect(
            model.upsertUserAccess({
                resourceUuid: savedSqlUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.EDITOR,
                ...mutationExpectation(),
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.VIEWER,
            afterRole: SpaceMemberRole.EDITOR,
        });
        await expect(
            model.revokeUserAccess({
                resourceUuid: savedSqlUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                ...mutationExpectation(),
            }),
        ).resolves.toMatchObject({
            beforeRole: SpaceMemberRole.EDITOR,
            afterRole: null,
        });
        await expect(
            model.resetAccess({
                resourceUuid: savedSqlUuid,
                ...mutationExpectation(),
            }),
        ).resolves.toMatchObject({ revokedUsers: 0, revokedGroups: 1 });
    });

    it('stops resolving grants when current project access is removed', async () => {
        const principalUuid = randomUUID();
        const [principal] = await transaction(UserTableName)
            .insert({
                user_uuid: principalUuid,
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
            user_id: principal.user_id,
            role: OrganizationMemberRole.MEMBER,
        });
        await transaction(ProjectMembershipsTableName).insert({
            project_id: projectId,
            user_id: principal.user_id,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
            group_uuid: groupUuid,
            user_id: principal.user_id,
        });
        await model.upsertUserAccess({
            resourceUuid: savedSqlUuid,
            userUuid: principalUuid,
            role: SpaceMemberRole.VIEWER,
            ...mutationExpectation(),
            grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        await model.upsertGroupAccess({
            resourceUuid: savedSqlUuid,
            groupUuid,
            role: SpaceMemberRole.ADMIN,
            ...mutationExpectation(),
            grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        await expect(
            model.getUserAccess([savedSqlUuid], principalUuid, {
                organizationUuid,
            }),
        ).resolves.toMatchObject({
            [savedSqlUuid]: {
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.ADMIN],
            },
        });

        await transaction(GroupMembershipTableName)
            .where({ group_uuid: groupUuid, user_id: principal.user_id })
            .delete();
        await expect(
            model.getUserAccess([savedSqlUuid], principalUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(`${savedSqlUuid}.groupRoles`, []);

        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
            group_uuid: groupUuid,
            user_id: principal.user_id,
        });
        await transaction(ProjectGroupAccessTableName)
            .where({ project_uuid: projectUuid, group_uuid: groupUuid })
            .delete();
        await expect(
            model.getUserAccess([savedSqlUuid], principalUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(`${savedSqlUuid}.groupRoles`, []);

        await transaction(ProjectMembershipsTableName)
            .where({ project_id: projectId, user_id: principal.user_id })
            .delete();
        await expect(
            model.getUserAccess([savedSqlUuid], principalUuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
    });

    it('scopes mutations to the organization and active project principals', async () => {
        await expect(
            model.upsertUserAccess({
                resourceUuid: savedSqlUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                organizationUuid: randomUUID(),
                projectUuid,
                spaceUuid,
                dashboardUuid: null,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
        await expect(
            model.upsertUserAccess({
                resourceUuid: savedSqlUuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                ...mutationExpectation(),
                spaceUuid: randomUUID(),
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({
            name: 'NotFoundError',
            message: 'Direct access target not found',
        });
        await expect(
            model.upsertGroupAccess({
                resourceUuid: savedSqlUuid,
                groupUuid: randomUUID(),
                role: SpaceMemberRole.VIEWER,
                ...mutationExpectation(),
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
    });

    it('rejects grants to dashboard-owned SQL charts', async () => {
        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectUuid,
                name: `SQL owner ${randomUUID()}`,
                description: undefined,
                space_id: spaceId,
                slug: `sql-owner-${randomUUID()}`,
            })
            .returning('dashboard_uuid');
        const [dashboardSql] = await transaction(SavedSqlTableName)
            .insert({
                project_uuid: projectUuid,
                space_uuid: null,
                dashboard_uuid: dashboard.dashboard_uuid,
                name: `Owned SQL chart ${randomUUID()}`,
                description: null,
                slug: `owned-sql-${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('saved_sql_uuid');

        await expect(
            model.upsertUserAccess({
                resourceUuid: dashboardSql.saved_sql_uuid,
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                role: SpaceMemberRole.VIEWER,
                organizationUuid,
                projectUuid,
                spaceUuid: null,
                dashboardUuid: dashboard.dashboard_uuid,
                grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            }),
        ).rejects.toMatchObject({ name: 'ParameterError' });
    });

    it('preserves grants through soft delete and restore and cascades permanent deletion', async () => {
        await model.upsertUserAccess({
            resourceUuid: savedSqlUuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            role: SpaceMemberRole.VIEWER,
            ...mutationExpectation(),
            grantedByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        await transaction(SavedSqlTableName)
            .where('saved_sql_uuid', savedSqlUuid)
            .update({ deleted_at: new Date() });
        await expect(
            model.getUserAccess([savedSqlUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
        await expect(
            transaction(SavedSqlUserAccessTableName)
                .where('saved_sql_uuid', savedSqlUuid)
                .count('* as count')
                .first(),
        ).resolves.toMatchObject({ count: 1n });

        await transaction(SavedSqlTableName)
            .where('saved_sql_uuid', savedSqlUuid)
            .update({ deleted_at: null });
        await expect(
            model.getUserAccess([savedSqlUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(
            `${savedSqlUuid}.userRole`,
            SpaceMemberRole.VIEWER,
        );

        await transaction(SavedSqlTableName)
            .where('saved_sql_uuid', savedSqlUuid)
            .delete();
        const [userGrantCount, groupGrantCount] = await Promise.all([
            transaction(SavedSqlUserAccessTableName)
                .where('saved_sql_uuid', savedSqlUuid)
                .count<{ count: bigint }>('* as count')
                .first(),
            transaction(SavedSqlGroupAccessTableName)
                .where('saved_sql_uuid', savedSqlUuid)
                .count<{ count: bigint }>('* as count')
                .first(),
        ]);
        expect(userGrantCount?.count).toBe(0n);
        expect(groupGrantCount?.count).toBe(0n);
    });
});
