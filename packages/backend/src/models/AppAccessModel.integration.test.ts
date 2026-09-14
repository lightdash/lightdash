import {
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
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import { AppAccessModel } from './AppAccessModel';

describe('AppAccessModel PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: AppAccessModel;
    let organizationId: number;
    let organizationUuid: string;
    let projectUuid: string;
    let spaceUuid: string;
    let userId: number;
    let personalAppUuid: string;
    let spaceAppUuid: string;
    let groupUuid: string;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new AppAccessModel(transaction);

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
                organizationId: number;
                organizationUuid: string;
                projectUuid: string;
                spaceUuid: string;
            }>({
                organizationId: `${OrganizationTableName}.organization_id`,
                organizationUuid: `${OrganizationTableName}.organization_uuid`,
                projectUuid: `${ProjectTableName}.project_uuid`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
            })
            .first();
        const seedUser = await transaction(UserTableName)
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .first<{ userId: number }>({ userId: 'user_id' });
        if (projectSpace === undefined || seedUser === undefined) {
            throw new Error('Seed app access fixtures not found');
        }
        ({ organizationId, organizationUuid, projectUuid, spaceUuid } =
            projectSpace);
        userId = seedUser.userId;

        [personalAppUuid, spaceAppUuid] = await Promise.all(
            [null, spaceUuid].map(async (appSpaceUuid) => {
                const [inserted] = await transaction(AppsTableName)
                    .insert({
                        project_uuid: projectUuid,
                        created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                        slug: `app-access-${randomUUID()}`,
                        space_uuid: appSpaceUuid,
                    })
                    .returning('app_id');
                return inserted.app_id;
            }),
        );

        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: organizationId,
                name: `App access ${randomUUID()}`,
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
        await transaction(AppUserAccessTableName).insert(
            [personalAppUuid, spaceAppUuid].map((appUuid) => ({
                app_uuid: appUuid,
                user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })),
        );
        await transaction(AppGroupAccessTableName).insert(
            [personalAppUuid, spaceAppUuid].map((appUuid) => ({
                app_uuid: appUuid,
                group_uuid: groupUuid,
                space_role: SpaceMemberRole.EDITOR,
                granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })),
        );
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    it('resolves direct user and group roles for personal and space-backed apps', async () => {
        await expect(
            model.getUserAccess(
                [personalAppUuid, spaceAppUuid],
                SEED_ORG_1_ADMIN.user_uuid,
                { organizationUuid },
            ),
        ).resolves.toEqual({
            [personalAppUuid]: {
                organizationUuid,
                projectUuid,
                spaceUuid: null,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.EDITOR],
            },
            [spaceAppUuid]: {
                organizationUuid,
                projectUuid,
                spaceUuid,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.EDITOR],
            },
        });
    });

    it('tracks moves without transferring grants to new app identities', async () => {
        await transaction(AppsTableName)
            .where('app_id', personalAppUuid)
            .update({ space_uuid: spaceUuid });
        await expect(
            model.getUserAccess([personalAppUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(`${personalAppUuid}.spaceUuid`, spaceUuid);

        const [copy] = await transaction(AppsTableName)
            .insert({
                project_uuid: projectUuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                slug: `app-access-copy-${randomUUID()}`,
                space_uuid: spaceUuid,
            })
            .returning('app_id');
        await expect(
            model.getUserAccess([copy.app_id], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
    });

    it('supports deleted-app lifecycle authorization without cross-org access', async () => {
        await transaction(AppsTableName)
            .where('app_id', personalAppUuid)
            .update({
                deleted_at: new Date(),
                deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            });
        await expect(
            model.getUserAccess([personalAppUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
        await expect(
            model.getUserAccess([personalAppUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid,
                includeDeleted: true,
            }),
        ).resolves.toHaveProperty(
            `${personalAppUuid}.userRole`,
            SpaceMemberRole.VIEWER,
        );
        await expect(
            model.getUserAccess([personalAppUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid: randomUUID(),
                includeDeleted: true,
            }),
        ).resolves.toEqual({});
    });
});
