import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    ProjectMemberRole,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2,
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
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectTableName } from '../database/entities/projects';
import { SavedSqlTableName } from '../database/entities/savedSql';
import {
    SavedSqlGroupAccessTableName,
    SavedSqlUserAccessTableName,
} from '../database/entities/savedSqlAccess';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { getTestContext } from '../vitest.setup.integration';
import { AppAccessModel } from './AppAccessModel';
import { DirectAccessModel } from './DirectAccessModel';
import { SavedSqlAccessModel } from './SavedSqlAccessModel';

describe('DirectAccessModel generic store PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let store: DirectAccessModel;
    let organizationId: number;
    let organizationUuid: string;
    let projectId: number;
    let projectUuid: string;
    let spaceId: number;
    let spaceUuid: string;
    let userUuid: string;
    let groupUuid: string;
    let groupName: string;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        store = new DirectAccessModel(transaction);

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
                space_id: number;
                space_uuid: string;
                project_id: number;
                project_uuid: string;
                organization_id: number;
                organization_uuid: string;
            }>(
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
        organizationId = projectSpace.organization_id;
        organizationUuid = projectSpace.organization_uuid;
        projectId = projectSpace.project_id;
        projectUuid = projectSpace.project_uuid;
        spaceId = projectSpace.space_id;
        spaceUuid = projectSpace.space_uuid;
        userUuid = SEED_ORG_1_ADMIN.user_uuid;

        groupName = `Direct access store group ${randomUUID()}`;
        const user = await transaction(UserTableName)
            .where('user_uuid', userUuid)
            .first<{ user_id: number }>('user_id');
        if (!user) {
            throw new Error('Seed user not found');
        }
        const [group] = await transaction(GroupTableName)
            .insert({
                organization_id: organizationId,
                name: groupName,
                created_by_user_uuid: userUuid,
                updated_by_user_uuid: userUuid,
            })
            .returning('group_uuid');
        groupUuid = group.group_uuid;
        await transaction(GroupMembershipTableName).insert({
            organization_id: organizationId,
            group_uuid: groupUuid,
            user_id: user.user_id,
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

    const createDashboard = async (): Promise<string> => {
        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectUuid,
                name: `Direct access store dashboard ${randomUUID()}`,
                description: undefined,
                space_id: spaceId,
                slug: `direct-access-store-dashboard-${randomUUID()}`,
            })
            .returning('dashboard_uuid');
        return dashboard.dashboard_uuid;
    };

    const createSqlChart = async (
        owner:
            | { spaceUuid: string; dashboardUuid: null }
            | { spaceUuid: null; dashboardUuid: string },
        { deleted = false }: { deleted?: boolean } = {},
    ): Promise<string> => {
        const [sqlChart] = await transaction(SavedSqlTableName)
            .insert({
                name: `Direct access store sql chart ${randomUUID()}`,
                description: null,
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                slug: `direct-access-store-sql-${randomUUID()}`,
                ...(owner.spaceUuid !== null
                    ? { space_uuid: owner.spaceUuid, dashboard_uuid: null }
                    : {
                          space_uuid: null,
                          dashboard_uuid: owner.dashboardUuid,
                      }),
            })
            .returning('saved_sql_uuid');
        if (deleted) {
            await transaction(SavedSqlTableName)
                .where('saved_sql_uuid', sqlChart.saved_sql_uuid)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: userUuid,
                });
        }
        return sqlChart.saved_sql_uuid;
    };

    const createApp = async ({
        appSpaceUuid = null,
        deleted = false,
    }: {
        appSpaceUuid?: string | null;
        deleted?: boolean;
    } = {}): Promise<string> => {
        const [app] = await transaction(AppsTableName)
            .insert({
                project_uuid: projectUuid,
                created_by_user_uuid: userUuid,
                slug: `direct-access-store-app-${randomUUID()}`,
                name: `Direct access store app ${randomUUID()}`,
                space_uuid: appSpaceUuid,
            })
            .returning('app_id');
        if (deleted) {
            await transaction(AppsTableName)
                .where('app_id', app.app_id)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: userUuid,
                });
        }
        return app.app_id;
    };

    const userPrincipal = () => ({
        type: DirectAccessPrincipalType.USER,
        uuid: userUuid,
    });

    const groupPrincipal = () => ({
        type: DirectAccessPrincipalType.GROUP,
        uuid: groupUuid,
    });

    describe('sql chart administration', () => {
        it('grants, revokes, and resets space-saved sql charts', async () => {
            const sqlChartUuid = await createSqlChart({
                spaceUuid,
                dashboardUuid: null,
            });
            const readModel = new SavedSqlAccessModel(transaction);

            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: sqlChartUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.EDITOR,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).resolves.toEqual({
                organizationId,
                organizationUuid,
                projectId,
                projectUuid,
                beforeRole: null,
                afterRole: SpaceMemberRole.EDITOR,
            });
            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: sqlChartUuid,
                    principal: groupPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).resolves.toMatchObject({
                beforeRole: null,
                afterRole: SpaceMemberRole.VIEWER,
            });
            await expect(
                readModel.getUserAccess([sqlChartUuid], userUuid, {
                    organizationUuid,
                }),
            ).resolves.toEqual({
                [sqlChartUuid]: {
                    organizationUuid,
                    projectUuid,
                    spaceUuid,
                    userRole: SpaceMemberRole.EDITOR,
                    groupRoles: [SpaceMemberRole.VIEWER],
                },
            });

            await expect(
                store.revokeAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: sqlChartUuid,
                    principal: userPrincipal(),
                    organizationUuid,
                }),
            ).resolves.toMatchObject({
                beforeRole: SpaceMemberRole.EDITOR,
                afterRole: null,
            });
            await expect(
                store.resetAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: sqlChartUuid,
                    organizationUuid,
                }),
            ).resolves.toMatchObject({ revokedUsers: 0, revokedGroups: 1 });
        });

        it('rejects grants on dashboard-owned sql charts but cleans stale rows', async () => {
            const dashboardUuid = await createDashboard();
            const ownedSqlUuid = await createSqlChart({
                spaceUuid: null,
                dashboardUuid,
            });
            await transaction(SavedSqlUserAccessTableName).insert({
                saved_sql_uuid: ownedSqlUuid,
                user_uuid: userUuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: userUuid,
            });
            await transaction(SavedSqlGroupAccessTableName).insert({
                saved_sql_uuid: ownedSqlUuid,
                group_uuid: groupUuid,
                space_role: SpaceMemberRole.EDITOR,
                granted_by_user_uuid: userUuid,
            });

            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: ownedSqlUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.ADMIN,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).rejects.toMatchObject({ name: 'ParameterError' });

            await expect(
                store.revokeAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: ownedSqlUuid,
                    principal: userPrincipal(),
                    organizationUuid,
                }),
            ).resolves.toMatchObject({
                beforeRole: SpaceMemberRole.VIEWER,
                afterRole: null,
            });
            await expect(
                store.resetAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: ownedSqlUuid,
                    organizationUuid,
                }),
            ).resolves.toMatchObject({ revokedUsers: 0, revokedGroups: 1 });
        });

        it('rejects a sql chart whose owner space is deleted', async () => {
            const deletedSpaceSlug = `direct-access-store-sql-space-${randomUUID()}`;
            const seedUser = await transaction(UserTableName)
                .where('user_uuid', userUuid)
                .first<{ user_id: number }>('user_id');
            const [deletedSpace] = await transaction(SpaceTableName)
                .insert({
                    name: `Direct access store sql deleted space ${randomUUID()}`,
                    project_id: projectId,
                    created_by_user_id: seedUser!.user_id,
                    slug: deletedSpaceSlug,
                    parent_space_uuid: null,
                    path: deletedSpaceSlug.replaceAll('-', '_'),
                    inherit_parent_permissions: false,
                    is_default_user_space: false,
                })
                .returning(['space_id', 'space_uuid']);
            const sqlChartUuid = await createSqlChart({
                spaceUuid: deletedSpace.space_uuid,
                dashboardUuid: null,
            });
            await transaction(SpaceTableName)
                .where('space_id', deletedSpace.space_id)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: userUuid,
                });

            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: sqlChartUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });
        });

        it('rejects deleted and cross-organization sql charts', async () => {
            const deletedSqlUuid = await createSqlChart(
                { spaceUuid, dashboardUuid: null },
                { deleted: true },
            );
            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: deletedSqlUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });

            const sqlChartUuid = await createSqlChart({
                spaceUuid,
                dashboardUuid: null,
            });
            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.SQL_CHART,
                    resourceUuid: sqlChartUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid: SEED_ORG_2.organization_uuid,
                    grantedByUserUuid: userUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });
        });
    });

    describe('app administration', () => {
        it('grants personal apps and keeps their space null on reads', async () => {
            const appUuid = await createApp();
            const readModel = new AppAccessModel(transaction);

            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: appUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).resolves.toEqual({
                organizationId,
                organizationUuid,
                projectId,
                projectUuid,
                beforeRole: null,
                afterRole: SpaceMemberRole.VIEWER,
            });
            await expect(
                readModel.getUserAccess([appUuid], userUuid, {
                    organizationUuid,
                }),
            ).resolves.toEqual({
                [appUuid]: {
                    organizationUuid,
                    projectUuid,
                    spaceUuid: null,
                    userRole: SpaceMemberRole.VIEWER,
                    groupRoles: [],
                },
            });
        });

        it('grants and resets space-backed apps', async () => {
            const appUuid = await createApp({ appSpaceUuid: spaceUuid });

            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: appUuid,
                    principal: groupPrincipal(),
                    role: SpaceMemberRole.EDITOR,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).resolves.toMatchObject({
                beforeRole: null,
                afterRole: SpaceMemberRole.EDITOR,
            });
            await expect(
                store.resetAccess({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: appUuid,
                    organizationUuid,
                }),
            ).resolves.toMatchObject({ revokedUsers: 0, revokedGroups: 1 });
        });

        it('rejects a space-backed app whose space is deleted', async () => {
            const deletedSpaceSlug = `direct-access-store-space-${randomUUID()}`;
            const seedUser = await transaction(UserTableName)
                .where('user_uuid', userUuid)
                .first<{ user_id: number }>('user_id');
            const [deletedSpace] = await transaction(SpaceTableName)
                .insert({
                    name: `Direct access store deleted space ${randomUUID()}`,
                    project_id: projectId,
                    created_by_user_id: seedUser!.user_id,
                    slug: deletedSpaceSlug,
                    parent_space_uuid: null,
                    path: deletedSpaceSlug.replaceAll('-', '_'),
                    inherit_parent_permissions: false,
                    is_default_user_space: false,
                })
                .returning(['space_id', 'space_uuid']);
            const appUuid = await createApp({
                appSpaceUuid: deletedSpace.space_uuid,
            });
            await transaction(SpaceTableName)
                .where('space_id', deletedSpace.space_id)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: userUuid,
                });

            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: appUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });
            await expect(
                store.listAssignments({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: appUuid,
                    organizationUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });
        });

        it('rejects deleted and cross-organization apps', async () => {
            const deletedAppUuid = await createApp({ deleted: true });
            await expect(
                store.upsertAccess({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: deletedAppUuid,
                    principal: userPrincipal(),
                    role: SpaceMemberRole.VIEWER,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });

            const appUuid = await createApp();
            await expect(
                store.resetAccess({
                    resourceType: DirectAccessResourceType.APP,
                    resourceUuid: appUuid,
                    organizationUuid: SEED_ORG_2.organization_uuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });
        });
    });

    describe('listAssignments', () => {
        it('returns stored user and group assignments with principal metadata', async () => {
            const dashboardUuid = await createDashboard();
            await transaction(DashboardUserAccessTableName).insert({
                dashboard_uuid: dashboardUuid,
                user_uuid: userUuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: userUuid,
            });
            await transaction(DashboardGroupAccessTableName).insert({
                dashboard_uuid: dashboardUuid,
                group_uuid: groupUuid,
                space_role: SpaceMemberRole.ADMIN,
                granted_by_user_uuid: null,
            });

            const assignments = await store.listAssignments({
                resourceType: DirectAccessResourceType.DASHBOARD,
                resourceUuid: dashboardUuid,
                organizationUuid,
            });
            expect(assignments).toEqual([
                {
                    principal: {
                        type: DirectAccessPrincipalType.USER,
                        userUuid,
                        firstName: expect.any(String),
                        lastName: expect.any(String),
                        email: expect.any(String),
                    },
                    role: SpaceMemberRole.VIEWER,
                    grantedByUserUuid: userUuid,
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                },
                {
                    principal: {
                        type: DirectAccessPrincipalType.GROUP,
                        groupUuid,
                        name: groupName,
                    },
                    role: SpaceMemberRole.ADMIN,
                    grantedByUserUuid: null,
                    createdAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                },
            ]);
        });

        it('returns an empty list for a resource without assignments', async () => {
            const dashboardUuid = await createDashboard();
            await expect(
                store.listAssignments({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: dashboardUuid,
                    organizationUuid,
                }),
            ).resolves.toEqual([]);
        });

        it('rejects unknown and cross-organization resources', async () => {
            await expect(
                store.listAssignments({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: randomUUID(),
                    organizationUuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });

            const dashboardUuid = await createDashboard();
            await expect(
                store.listAssignments({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: dashboardUuid,
                    organizationUuid: SEED_ORG_2.organization_uuid,
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });
        });
    });

    describe('replacePolicy', () => {
        it('atomically replaces the whole policy', async () => {
            const dashboardUuid = await createDashboard();
            await transaction(DashboardUserAccessTableName).insert({
                dashboard_uuid: dashboardUuid,
                user_uuid: userUuid,
                space_role: SpaceMemberRole.ADMIN,
                granted_by_user_uuid: userUuid,
            });

            await expect(
                store.replacePolicy({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: dashboardUuid,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                    assignments: [
                        {
                            principal: userPrincipal(),
                            role: SpaceMemberRole.VIEWER,
                        },
                        {
                            principal: groupPrincipal(),
                            role: SpaceMemberRole.EDITOR,
                        },
                    ],
                }),
            ).resolves.toMatchObject({
                revokedUsers: 1,
                revokedGroups: 0,
                appliedUsers: 1,
                appliedGroups: 1,
            });

            const assignments = await store.listAssignments({
                resourceType: DirectAccessResourceType.DASHBOARD,
                resourceUuid: dashboardUuid,
                organizationUuid,
            });
            expect(assignments).toHaveLength(2);
            expect(assignments).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ role: SpaceMemberRole.VIEWER }),
                    expect.objectContaining({ role: SpaceMemberRole.EDITOR }),
                ]),
            );
        });

        it('clears the policy when given no assignments', async () => {
            const dashboardUuid = await createDashboard();
            await transaction(DashboardGroupAccessTableName).insert({
                dashboard_uuid: dashboardUuid,
                group_uuid: groupUuid,
                space_role: SpaceMemberRole.VIEWER,
                granted_by_user_uuid: userUuid,
            });

            await expect(
                store.replacePolicy({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: dashboardUuid,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                    assignments: [],
                }),
            ).resolves.toMatchObject({
                revokedUsers: 0,
                revokedGroups: 1,
                appliedUsers: 0,
                appliedGroups: 0,
            });
        });

        it('rejects duplicate principals before touching the database', async () => {
            const dashboardUuid = await createDashboard();
            await expect(
                store.replacePolicy({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: dashboardUuid,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                    assignments: [
                        {
                            principal: userPrincipal(),
                            role: SpaceMemberRole.VIEWER,
                        },
                        {
                            principal: userPrincipal(),
                            role: SpaceMemberRole.ADMIN,
                        },
                    ],
                }),
            ).rejects.toMatchObject({ name: 'ParameterError' });
        });

        it('keeps the existing policy when a principal is invalid', async () => {
            const dashboardUuid = await createDashboard();
            await transaction(DashboardUserAccessTableName).insert({
                dashboard_uuid: dashboardUuid,
                user_uuid: userUuid,
                space_role: SpaceMemberRole.ADMIN,
                granted_by_user_uuid: userUuid,
            });

            await expect(
                store.replacePolicy({
                    resourceType: DirectAccessResourceType.DASHBOARD,
                    resourceUuid: dashboardUuid,
                    organizationUuid,
                    grantedByUserUuid: userUuid,
                    assignments: [
                        {
                            principal: {
                                type: DirectAccessPrincipalType.USER,
                                uuid: randomUUID(),
                            },
                            role: SpaceMemberRole.VIEWER,
                        },
                    ],
                }),
            ).rejects.toMatchObject({ name: 'NotFoundError' });

            await expect(
                transaction(DashboardUserAccessTableName).where({
                    dashboard_uuid: dashboardUuid,
                    user_uuid: userUuid,
                }),
            ).resolves.toHaveLength(1);
        });
    });
});
