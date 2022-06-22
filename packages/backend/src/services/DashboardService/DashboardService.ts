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
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { CreateDashboardOrVersionEvent } from '../../analytics/LightdashAnalytics';
import database from '../../database/database';
import { getSpace } from '../../database/entities/spaces';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';

type Dependencies = {
    dashboardModel: DashboardModel;
};

export class DashboardService {
    dashboardModel: DashboardModel;

    constructor({ dashboardModel }: Dependencies) {
        this.dashboardModel = dashboardModel;
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
        return dashboards.filter((dashboard) =>
            user.ability.can('view', subject('Dashboard', dashboard)),
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
        return dashboard;
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const space = await getSpace(database, projectUuid);
        if (
            user.ability.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organization_uuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const newDashboard = await this.dashboardModel.create(
            space.space_uuid,
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
        const space = await getSpace(database, projectUuid);

        const duplicatedDashboard = {
            ...dashboard,
            name: `Copy of ${dashboard.name}`,
        };
        const newDashboard = await this.dashboardModel.create(
            space.space_uuid,
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
        if (isDashboardUnversionedFields(dashboard)) {
            const updatedDashboard = await this.dashboardModel.update(
                dashboardUuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
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

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        const { organizationUuid, projectUuid } =
            await this.dashboardModel.getById(dashboardUuid);
        if (
            user.ability.cannot(
                'delete',
                subject('Dashboard', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
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
