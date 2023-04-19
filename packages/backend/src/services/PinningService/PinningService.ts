import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ResourceViewChartItem,
    ResourceViewDashboardItem,
    ResourceViewSpaceItem,
    SessionUser,
} from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ResourceViewItemModel } from '../../models/ResourceViewItemModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';

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
    ): Promise<{
        spaces: ResourceViewSpaceItem[];
        charts: ResourceViewChartItem[];
        dashboards: ResourceViewDashboardItem[];
    }> {
        const project = await this.projectModel.get(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        const allPinnedSpaces =
            await this.resourceViewItemModel.getAllSpacesByPinnedListUuid(
                projectUuid,
                pinnedListUuid,
            );
        // TODO: remove custom auth logic (blocked by https://github.com/lightdash/lightdash/pull/5108)
        const hasSpaceAccess = (space: ResourceViewSpaceItem) => {
            if (space.data.projectUuid !== projectUuid) {
                return false;
            }
            if (
                space.data.isPrivate &&
                space.data.access.find(
                    (userUuid) => userUuid === user.userUuid,
                ) === undefined
            ) {
                return false;
            }
            return true;
        };
        const allowedSpaces = allPinnedSpaces.filter(hasSpaceAccess);
        if (allowedSpaces.length === 0) {
            return { spaces: [], charts: [], dashboards: [] };
        }
        const allowedSpaceUuids = allowedSpaces.map((space) => space.data.uuid);
        const { charts: allowedCharts, dashboards: allowedDashboards } =
            await this.resourceViewItemModel.getAllowedChartsAndDashboards(
                projectUuid,
                pinnedListUuid,
                allowedSpaceUuids,
            );

        return {
            spaces: allowedSpaces,
            charts: allowedCharts,
            dashboards: allowedDashboards,
        };
    }
}
