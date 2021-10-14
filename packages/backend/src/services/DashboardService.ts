import {
    CreateDashboard,
    Dashboard,
    DashboardBasicDetails,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    SessionUser,
    UpdateDashboard,
} from 'common';
import { analytics } from '../analytics/client';
import { DashboardModel } from '../models/DashboardModel';
import { getSpace } from '../database/entities/spaces';
import database from '../database/database';

type Dependencies = {
    dashboardModel: DashboardModel;
};

export class DashboardService {
    dashboardModel: DashboardModel;

    constructor({ dashboardModel }: Dependencies) {
        this.dashboardModel = dashboardModel;
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<DashboardBasicDetails[]> {
        return this.dashboardModel.getAllByProject(projectUuid);
    }

    async getById(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        return this.dashboardModel.getById(dashboardUuid);
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const space = await getSpace(database, projectUuid);
        const dashboardUuid = await this.dashboardModel.create(
            space.space_uuid,
            dashboard,
        );
        analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            properties: {
                dashboardId: dashboardUuid,
            },
        });
        return this.getById(user, dashboardUuid);
    }

    async update(
        user: SessionUser,
        dashboardUuid: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        if (isDashboardUnversionedFields(dashboard)) {
            await this.dashboardModel.update(dashboardUuid, {
                name: dashboard.name,
                description: dashboard.description,
            });
            analytics.track({
                event: 'dashboard.updated',
                userId: user.userUuid,
                organizationId: user.organizationUuid,
                properties: {
                    dashboardId: dashboardUuid,
                },
            });
        }
        if (isDashboardVersionedFields(dashboard)) {
            await this.dashboardModel.addVersion(dashboardUuid, {
                tiles: dashboard.tiles,
            });
            analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                organizationId: user.organizationUuid,
                properties: {
                    dashboardId: dashboardUuid,
                },
            });
        }
        return this.getById(user, dashboardUuid);
    }

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        await this.dashboardModel.delete(dashboardUuid);
        analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                dashboardId: dashboardUuid,
            },
        });
    }
}
