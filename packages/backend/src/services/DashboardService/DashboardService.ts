import { subject } from '@casl/ability';
import {
    CreateDashboard,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    ForbiddenError,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    SessionUser,
    UpdateDashboard,
    UpdateMultipleDashboards,
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { CreateDashboardOrVersionEvent } from '../../analytics/LightdashAnalytics';
import database from '../../database/database';
import { getSpace } from '../../database/entities/spaces';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { spaceModel } from '../../models/models';
import { SpaceModel } from '../../models/SpaceModel';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type Dependencies = {
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
};

export class DashboardService {
    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    constructor({ dashboardModel }: Dependencies) {
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
    }

    async hasDashboardSpaceAccess(
        spaceUuid: string,
        userUuid: string,
    ): Promise<boolean> {
        try {
            const space = await this.spaceModel.getFullSpace(spaceUuid);
            return hasSpaceAccess(space, userUuid);
        } catch (e) {
            return false;
        }
    }

    static getCreateEventProperties(
        dashboard: Dashboard,
    ): CreateDashboardOrVersionEvent['properties'] {
        return {
            projectId: dashboard.projectUuid,
            dashboardId: dashboard.uuid,
            filtersCount: dashboard.filters
                ? dashboard.filters.metrics.length +
                  dashboard.filters.dimensions.length
                : 0,
            tilesCount: dashboard.tiles.length,
            chartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SAVED_CHART,
            ).length,
            markdownTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.MARKDOWN,
            ).length,
            loomTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.LOOM,
            ).length,
        };
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: string,
        chartUuid?: string,
    ): Promise<DashboardBasicDetails[]> {
        const dashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            chartUuid,
        );

        const spaceUuids = [
            ...new Set(dashboards.map((dashboard) => dashboard.spaceUuid)),
        ];
        const spaceAccess: Record<string, boolean> = await spaceUuids.reduce<
            Promise<Record<string, boolean>>
        >(async (accPromise, spaceUuid) => {
            const acc = await accPromise;
            acc[spaceUuid] = await this.hasDashboardSpaceAccess(
                spaceUuid,
                user.userUuid,
            );
            return acc;
        }, Promise.resolve({}));
        return dashboards.filter(
            (dashboard) =>
                user.ability.can('view', subject('Dashboard', dashboard)) &&
                spaceAccess[dashboard.spaceUuid],
        );
    }

    async getById(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        if (user.ability.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError();
        }
        if (
            !(await this.hasDashboardSpaceAccess(
                dashboard.spaceUuid,
                user.userUuid,
            ))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        return dashboard;
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const getFirstSpace = async () => {
            const space = await getSpace(database, projectUuid);
            return {
                organizationUuid: space.organization_uuid,
                uuid: space.space_uuid,
            };
        };
        const space = dashboard.spaceUuid
            ? await spaceModel.get(dashboard.spaceUuid)
            : await getFirstSpace();

        if (
            user.ability.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!(await this.hasDashboardSpaceAccess(space.uuid, user.userUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        const newDashboard = await this.dashboardModel.create(
            space.uuid,
            dashboard,
            user,
        );
        analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: DashboardService.getCreateEventProperties(newDashboard),
        });
        return this.getById(user, newDashboard.uuid);
    }

    async duplicate(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        if (user.ability.cannot('create', subject('Dashboard', dashboard))) {
            throw new ForbiddenError();
        }

        if (
            !(await this.hasDashboardSpaceAccess(
                dashboard.spaceUuid,
                user.userUuid,
            ))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const duplicatedDashboard = {
            ...dashboard,
            name: `Copy of ${dashboard.name}`,
        };
        const newDashboard = await this.dashboardModel.create(
            dashboard.spaceUuid,
            duplicatedDashboard,
            user,
        );

        const dashboardProperties =
            DashboardService.getCreateEventProperties(newDashboard);
        analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: { ...dashboardProperties, duplicated: true },
        });

        analytics.track({
            event: 'duplicated_dashboard_created',
            userId: user.userUuid,
            properties: {
                ...dashboardProperties,
                newDashboardId: newDashboard.uuid,
                duplicateOfDashboardId: dashboard.uuid,
            },
        });
        return this.getById(user, newDashboard.uuid);
    }

    async update(
        user: SessionUser,
        dashboardUuid: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        const existingDashboard = await this.dashboardModel.getById(
            dashboardUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Dashboard', existingDashboard),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            !(await this.hasDashboardSpaceAccess(
                existingDashboard.spaceUuid,
                user.userUuid,
            ))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (isDashboardUnversionedFields(dashboard)) {
            const updatedDashboard = await this.dashboardModel.update(
                dashboardUuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
                    spaceUuid: dashboard.spaceUuid,
                },
            );

            analytics.track({
                event: 'dashboard.updated',
                userId: user.userUuid,
                properties: {
                    dashboardId: updatedDashboard.uuid,
                    projectId: updatedDashboard.projectUuid,
                },
            });
        }
        if (isDashboardVersionedFields(dashboard)) {
            const updatedDashboard = await this.dashboardModel.addVersion(
                dashboardUuid,
                {
                    tiles: dashboard.tiles,
                    filters: dashboard.filters,
                },
                user,
            );
            analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                properties:
                    DashboardService.getCreateEventProperties(updatedDashboard),
            });
        }
        return this.getById(user, dashboardUuid);
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: string,
        dashboards: UpdateMultipleDashboards[],
    ): Promise<Dashboard[]> {
        const space = await getSpace(database, projectUuid);

        if (
            user.ability.cannot(
                'update',
                subject('Dashboard', {
                    organizationUuid: space.organization_uuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            !(await this.hasDashboardSpaceAccess(
                space.space_uuid,
                user.userUuid,
            ))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        analytics.track({
            event: 'dashboard.updated_multiple',
            userId: user.userUuid,
            properties: {
                dashboardIds: dashboards.map((dashboard) => dashboard.uuid),
                projectId: projectUuid,
            },
        });
        return this.dashboardModel.updateMultiple(projectUuid, dashboards);
    }

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        const { organizationUuid, projectUuid, spaceUuid } =
            await this.dashboardModel.getById(dashboardUuid);
        if (
            user.ability.cannot(
                'delete',
                subject('Dashboard', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(spaceUuid, user.userUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        const deletedDashboard = await this.dashboardModel.delete(
            dashboardUuid,
        );
        analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            properties: {
                dashboardId: deletedDashboard.uuid,
                projectId: deletedDashboard.projectUuid,
            },
        });
    }
}
