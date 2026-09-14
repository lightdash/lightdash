import {
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

describe('SavedSqlAccessModel PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SavedSqlAccessModel;
    let organizationId: number;
    let organizationUuid: string;
    let projectId: number;
    let projectUuid: string;
    let spaceId: number;
    let spaceUuid: string;
    let adminUserId: number;

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
                `${OrganizationTableName}.organization_id`,
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.project_id`,
                `${ProjectTableName}.project_uuid`,
                `${SpaceTableName}.space_id`,
                `${SpaceTableName}.space_uuid`,
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

        const admin = await transaction(UserTableName)
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .select('user_id')
            .first();
        if (!admin) {
            throw new Error('Seed user not found');
        }
        adminUserId = admin.user_id;
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const createSpaceChart = async () => {
        const [chart] = await transaction(SavedSqlTableName)
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
        return chart.saved_sql_uuid;
    };

    it('resolves current user and group grants for active space charts only', async () => {
        const activeChartUuid = await createSpaceChart();
        const deletedChartUuid = await createSpaceChart();
        await transaction(SavedSqlTableName)
            .where('saved_sql_uuid', deletedChartUuid)
            .update({ deleted_at: new Date() });

        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectUuid,
                name: `Direct access owner ${randomUUID()}`,
                description: undefined,
                space_id: spaceId,
                slug: `direct-access-owner-${randomUUID()}`,
            })
            .returning('dashboard_uuid');
        const [dashboardChart] = await transaction(SavedSqlTableName)
            .insert({
                project_uuid: projectUuid,
                space_uuid: null,
                dashboard_uuid: dashboard.dashboard_uuid,
                name: `Dashboard SQL chart ${randomUUID()}`,
                description: null,
                slug: `dashboard-sql-${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('saved_sql_uuid');

        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: organizationId,
                name: `Direct access group ${randomUUID()}`,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })
            .returning('group_uuid');
        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
            group_uuid: group.group_uuid,
            user_id: adminUserId,
        });
        await transaction(ProjectGroupAccessTableName).insert({
            project_uuid: projectUuid,
            group_uuid: group.group_uuid,
            role: ProjectMemberRole.VIEWER,
        });
        await transaction(SavedSqlUserAccessTableName).insert(
            [
                activeChartUuid,
                deletedChartUuid,
                dashboardChart.saved_sql_uuid,
            ].map((savedSqlUuid) => ({
                saved_sql_uuid: savedSqlUuid,
                user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            })),
        );
        await transaction(SavedSqlGroupAccessTableName).insert({
            saved_sql_uuid: activeChartUuid,
            group_uuid: group.group_uuid,
            space_role: SpaceMemberRole.ADMIN,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        await expect(
            model.getUserAccess(
                [
                    activeChartUuid,
                    deletedChartUuid,
                    dashboardChart.saved_sql_uuid,
                ],
                SEED_ORG_1_ADMIN.user_uuid,
                { organizationUuid },
            ),
        ).resolves.toEqual({
            [activeChartUuid]: {
                organizationUuid,
                projectUuid,
                spaceUuid,
                userRole: SpaceMemberRole.VIEWER,
                groupRoles: [SpaceMemberRole.ADMIN],
            },
        });
        await expect(
            model.getUserAccess([activeChartUuid], SEED_ORG_1_ADMIN.user_uuid, {
                organizationUuid: randomUUID(),
            }),
        ).resolves.toEqual({});
    });

    it('stops resolving a user grant after project membership is removed', async () => {
        const savedSqlUuid = await createSpaceChart();
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
        await transaction(SavedSqlUserAccessTableName).insert({
            saved_sql_uuid: savedSqlUuid,
            user_uuid: principalUuid,
            space_role: SpaceMemberRole.EDITOR,
            granted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });

        await expect(
            model.getUserAccess([savedSqlUuid], principalUuid, {
                organizationUuid,
            }),
        ).resolves.toHaveProperty(
            `${savedSqlUuid}.userRole`,
            SpaceMemberRole.EDITOR,
        );

        await transaction(ProjectMembershipsTableName)
            .where({ project_id: projectId, user_id: principal.user_id })
            .delete();
        await expect(
            model.getUserAccess([savedSqlUuid], principalUuid, {
                organizationUuid,
            }),
        ).resolves.toEqual({});
    });
});
