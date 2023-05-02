import { subject } from '@casl/ability';
import { ForbiddenError, PinnedItems, SessionUser } from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ResourceViewItemModel } from '../../models/ResourceViewItemModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type Dependencies = {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;
    resourceViewItemModel: ResourceViewItemModel;
    projectModel: ProjectModel;
};

export class PinningService {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;

    resourceViewItemModel: ResourceViewItemModel;

    projectModel: ProjectModel;

    constructor({
        dashboardModel,
        savedChartModel,
        spaceModel,
        pinnedListModel,
        resourceViewItemModel,
        projectModel,
    }: Dependencies) {
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.pinnedListModel = pinnedListModel;
        this.resourceViewItemModel = resourceViewItemModel;
        this.projectModel = projectModel;
    }

    async getPinnedItems(
        user: SessionUser,
        projectUuid: string,
        pinnedListUuid: string,
    ): Promise<PinnedItems> {
        const project = await this.projectModel.get(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.getAllSpaces(projectUuid);
        const allowedSpaceUuids = spaces
            .filter((space) => hasSpaceAccess(space, user.userUuid))
            .map((space) => space.uuid);

        if (allowedSpaceUuids.length === 0) {
            return { spaces: [], charts: [], dashboards: [] };
        }
        const allPinnedSpaces =
            await this.resourceViewItemModel.getAllSpacesByPinnedListUuid(
                projectUuid,
                pinnedListUuid,
            );

        const allowedPinnedSpaces = allPinnedSpaces.filter(
            ({ data: { uuid } }) => allowedSpaceUuids.includes(uuid),
        );
        const { charts: allowedCharts, dashboards: allowedDashboards } =
            await this.resourceViewItemModel.getAllowedChartsAndDashboards(
                projectUuid,
                pinnedListUuid,
                allowedSpaceUuids,
            );

        return {
            spaces: allowedPinnedSpaces,
            charts: allowedCharts,
            dashboards: allowedDashboards,
        };
    }

    async updatePinnedItemsOrder(
        user: SessionUser,
        projectUuid: string,
        pinnedListUuid: string,
        itemsOrder: {
            dashboards: string[];
            charts: string[];
            spaces: string[];
        },
    ): Promise<PinnedItems> {
        // TODO update order
        return this.getPinnedItems(user, projectUuid, pinnedListUuid);
    }
}
