import { SpaceMemberRole, type UUID } from '@lightdash/common';
import { type Knex } from 'knex';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import {
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { SpacePermissionService } from '../services/SpaceService/SpacePermissionService';
import { getTestContext } from '../vitest.setup.integration';
import { DashboardAccessContainerModel } from './DashboardAccessContainerModel';
import { SpaceModel } from './SpaceModel';
import { SpacePermissionModel } from './SpacePermissionModel';

type DashboardLocation = {
    dashboardUuid: UUID;
    logicalSpaceId: number;
    logicalSpaceUuid: UUID;
    projectId: number;
    projectUuid: UUID;
};

const requireRow = <T>(row: T | undefined, message: string): T => {
    if (row === undefined) {
        throw new Error(message);
    }
    return row;
};

describe('DashboardAccessContainerModel', () => {
    let transaction: Knex.Transaction;
    let containerModel: DashboardAccessContainerModel;
    let spaceModel: SpaceModel;
    let permissionService: SpacePermissionService;
    let dashboard: DashboardLocation;
    let userId: number;
    let userUuid: UUID;

    beforeEach(async () => {
        transaction = await getTestContext().db.transaction();
        containerModel = new DashboardAccessContainerModel(transaction);
        spaceModel = new SpaceModel({ database: transaction });
        permissionService = new SpacePermissionService(
            spaceModel,
            new SpacePermissionModel(transaction),
        );

        const dashboardRow = await transaction(DashboardsTableName)
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select<DashboardLocation>({
                dashboardUuid: `${DashboardsTableName}.dashboard_uuid`,
                logicalSpaceId: `${SpaceTableName}.space_id`,
                logicalSpaceUuid: `${SpaceTableName}.space_uuid`,
                projectId: `${ProjectTableName}.project_id`,
                projectUuid: `${ProjectTableName}.project_uuid`,
            })
            .first();
        dashboard = requireRow(dashboardRow, 'Dashboard fixture not found');

        const user = requireRow(
            await transaction('users')
                .select<{ userId: number; userUuid: UUID }>({
                    userId: 'user_id',
                    userUuid: 'user_uuid',
                })
                .first(),
            'User fixture not found',
        );
        userId = user.userId;
        userUuid = user.userUuid;
    });

    afterEach(async () => transaction.rollback());

    test('creates one container without changing the dashboard location', async () => {
        const first = await containerModel.getOrCreate(
            dashboard.dashboardUuid,
            userId,
            { trx: transaction },
        );
        const second = await containerModel.getOrCreate(
            dashboard.dashboardUuid,
            userId,
            { trx: transaction },
        );

        expect(second).toEqual(first);
        const container = requireRow(
            await transaction(SpaceTableName)
                .where('space_uuid', first.spaceUuid)
                .first(),
            'Container was not created',
        );
        expect(container).toMatchObject({
            project_id: dashboard.projectId,
            parent_space_uuid: null,
            inherit_parent_permissions: false,
            is_access_container: true,
            access_container_dashboard_uuid: dashboard.dashboardUuid,
        });

        const unchangedDashboard = await transaction(DashboardsTableName)
            .where('dashboard_uuid', dashboard.dashboardUuid)
            .first('space_id');
        if (unchangedDashboard === undefined) {
            throw new Error(
                'Dashboard was not found after creating its container',
            );
        }
        expect(unchangedDashboard.space_id).toBe(dashboard.logicalSpaceId);
    });

    test('serializes concurrent creation into one container', async () => {
        const database = getTestContext().db;
        const createdDashboard = requireRow(
            (
                await database(DashboardsTableName)
                    .insert({
                        project_uuid: dashboard.projectUuid,
                        space_id: dashboard.logicalSpaceId,
                        name: 'Concurrent access container test',
                        slug: `access-container-concurrent-${crypto.randomUUID()}`,
                    })
                    .returning<{ dashboard_uuid: UUID }[]>('dashboard_uuid')
            )[0],
            'Failed to create concurrent dashboard fixture',
        );

        try {
            const concurrentModel = new DashboardAccessContainerModel(database);
            const [first, second] = await Promise.all([
                concurrentModel.getOrCreate(
                    createdDashboard.dashboard_uuid,
                    userId,
                ),
                concurrentModel.getOrCreate(
                    createdDashboard.dashboard_uuid,
                    userId,
                ),
            ]);

            expect(second).toEqual(first);
            await expect(
                database(SpaceTableName)
                    .where(
                        'access_container_dashboard_uuid',
                        createdDashboard.dashboard_uuid,
                    )
                    .count<{ count: bigint }[]>('* as count')
                    .first(),
            ).resolves.toEqual({ count: 1n });
        } finally {
            await database(DashboardsTableName)
                .where('dashboard_uuid', createdDashboard.dashboard_uuid)
                .delete();
        }
    });

    test('hides containers from public space and permission lookups', async () => {
        const container = await containerModel.getOrCreate(
            dashboard.dashboardUuid,
            userId,
            { trx: transaction },
        );
        await transaction(SpaceUserAccessTableName).insert({
            space_uuid: container.spaceUuid,
            user_uuid: userUuid,
            space_role: SpaceMemberRole.VIEWER,
        });

        await expect(spaceModel.get(container.spaceUuid)).rejects.toThrow(
            'does not exist',
        );
        await expect(
            spaceModel.find({ spaceUuid: container.spaceUuid }),
        ).resolves.toEqual([]);
        await expect(
            SpaceModel.getSpaceIdAndName(transaction, container.spaceUuid),
        ).resolves.toBeUndefined();
        await expect(
            spaceModel.getSpacesByProjectUuid(dashboard.projectUuid),
        ).resolves.not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ uuid: container.spaceUuid }),
            ]),
        );
        await expect(
            permissionService.getSpacesAccessContext(userUuid, [
                container.spaceUuid,
            ]),
        ).resolves.toEqual({});

        const internalContext =
            await permissionService.getAccessContainerContext(
                userUuid,
                [container.spaceUuid],
                { trx: transaction },
            );
        expect(internalContext[container.spaceUuid]?.access).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    userUuid,
                    role: SpaceMemberRole.VIEWER,
                }),
            ]),
        );

        await expect(
            spaceModel.update(container.spaceUuid, { name: 'Visible name' }),
        ).rejects.toThrow('does not exist');
        await expect(
            spaceModel.addSpaceAccess(
                container.spaceUuid,
                userUuid,
                SpaceMemberRole.EDITOR,
            ),
        ).rejects.toThrow('does not exist');
        await spaceModel.softDelete(container.spaceUuid, userUuid);
        await spaceModel.permanentDelete(container.spaceUuid);
        await expect(
            transaction(SpaceTableName)
                .where('space_uuid', container.spaceUuid)
                .first(['deleted_at', 'space_uuid']),
        ).resolves.toMatchObject({
            deleted_at: null,
            space_uuid: container.spaceUuid,
        });
    });

    test('cascades the container and its grants when the dashboard is deleted', async () => {
        const [createdDashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: dashboard.projectUuid,
                space_id: dashboard.logicalSpaceId,
                name: 'Access container cascade test',
                slug: `access-container-test-${crypto.randomUUID()}`,
            })
            .returning<{ dashboard_uuid: UUID }[]>('dashboard_uuid');
        if (createdDashboard === undefined) {
            throw new Error('Failed to create dashboard fixture');
        }

        const container = await containerModel.getOrCreate(
            createdDashboard.dashboard_uuid,
            userId,
            { trx: transaction },
        );
        await transaction(SpaceUserAccessTableName).insert({
            space_uuid: container.spaceUuid,
            user_uuid: userUuid,
            space_role: SpaceMemberRole.VIEWER,
        });

        await transaction(DashboardsTableName)
            .where('dashboard_uuid', createdDashboard.dashboard_uuid)
            .delete();

        await expect(
            transaction(SpaceTableName)
                .where('space_uuid', container.spaceUuid)
                .first(),
        ).resolves.toBeUndefined();
        await expect(
            transaction(SpaceUserAccessTableName)
                .where('space_uuid', container.spaceUuid)
                .first(),
        ).resolves.toBeUndefined();
    });

    test('rejects dashboards stored inside access containers', async () => {
        const container = await containerModel.getOrCreate(
            dashboard.dashboardUuid,
            userId,
            { trx: transaction },
        );
        const containerSpace = requireRow(
            await transaction(SpaceTableName)
                .where('space_uuid', container.spaceUuid)
                .first<{ space_id: number }>('space_id'),
            'Container was not created',
        );
        const [nestedDashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: dashboard.projectUuid,
                space_id: containerSpace.space_id,
                name: 'Dashboard in an access container',
                slug: `access-container-nested-${crypto.randomUUID()}`,
            })
            .returning<{ dashboard_uuid: UUID }[]>('dashboard_uuid');
        if (nestedDashboard === undefined) {
            throw new Error('Failed to create nested dashboard fixture');
        }

        await expect(
            containerModel.getOrCreate(nestedDashboard.dashboard_uuid, userId, {
                trx: transaction,
            }),
        ).rejects.toThrow('Dashboard not found');
    });

    test('enforces the access-container shape in the database', async () => {
        const container = await containerModel.getOrCreate(
            dashboard.dashboardUuid,
            userId,
            { trx: transaction },
        );

        await expect(
            transaction(SpaceTableName)
                .where('space_uuid', container.spaceUuid)
                .update({ inherit_parent_permissions: true }),
        ).rejects.toThrow('spaces_access_container_shape_check');
    });

    test('enforces one access container per dashboard in the database', async () => {
        const container = await containerModel.getOrCreate(
            dashboard.dashboardUuid,
            userId,
            { trx: transaction },
        );
        const duplicateSlug = `duplicate-access-container-${crypto.randomUUID()}`;

        await expect(
            transaction.raw(
                `
                INSERT INTO ${SpaceTableName} (
                    project_id,
                    name,
                    created_by_user_id,
                    slug,
                    parent_space_uuid,
                    path,
                    inherit_parent_permissions,
                    is_default_user_space,
                    is_access_container,
                    access_container_dashboard_uuid
                )
                SELECT
                    project_id,
                    'Duplicate dashboard access container',
                    created_by_user_id,
                    ?,
                    NULL,
                    text2ltree(replace(?, '-', '_')),
                    FALSE,
                    FALSE,
                    TRUE,
                    access_container_dashboard_uuid
                FROM ${SpaceTableName}
                WHERE space_uuid = ?
                `,
                [duplicateSlug, duplicateSlug, container.spaceUuid],
            ),
        ).rejects.toThrow('spaces_access_container_dashboard_uuid_unique');
    });
});
