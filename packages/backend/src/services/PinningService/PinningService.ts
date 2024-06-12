import { subject } from '@casl/ability';
import {
    ForbiddenError,
    PinnedItems,
    SessionUser,
    UpdatePinnedItemOrder,
} from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ResourceViewItemModel } from '../../models/ResourceViewItemModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type PinningServiceArguments = {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;
    resourceViewItemModel: ResourceViewItemModel;
    projectModel: ProjectModel;
};

export class PinningService extends BaseService {
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
    }: PinningServiceArguments) {
        super();
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
        const project = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );
        const allowedSpaceUuids = spaces
            .filter((space, index) =>
                hasViewAccessToSpace(
                    user,
                    space,
                    spacesAccess[space.uuid] ?? [],
                ),
            )
            .map((s) => s.uuid);

        if (allowedSpaceUuids.length === 0) {
            return [];
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

        return [...allowedPinnedSpaces, ...allowedCharts, ...allowedDashboards];
    }

    async updatePinnedItemsOrder(
        user: SessionUser,
        projectUuid: string,
        pinnedListUuid: string,
        itemsOrder: Array<UpdatePinnedItemOrder>,
    ): Promise<PinnedItems> {
        const project = await this.projectModel.get(projectUuid);
        if (user.ability.cannot('manage', subject('PinnedItems', project))) {
            throw new ForbiddenError();
        }
        if (project.pinnedListUuid !== pinnedListUuid) {
            throw new ForbiddenError('Pinned list does not belong to project');
        }
        await this.pinnedListModel.updatePinnedItemsOrder(
            projectUuid,
            pinnedListUuid,
            itemsOrder,
        );
        return this.getPinnedItems(user, projectUuid, pinnedListUuid);
    }
}
