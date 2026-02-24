import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ResourceViewItemType,
    type PinnedItems,
    type ResourceViewSpaceItem,
    type SessionUser,
    type UpdatePinnedItemOrder,
} from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ResourceViewItemModel } from '../../models/ResourceViewItemModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type PinningServiceArguments = {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;
    resourceViewItemModel: ResourceViewItemModel;
    projectModel: ProjectModel;
    spacePermissionService: SpacePermissionService;
};

export class PinningService extends BaseService {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;

    resourceViewItemModel: ResourceViewItemModel;

    projectModel: ProjectModel;

    spacePermissionService: SpacePermissionService;

    constructor({
        dashboardModel,
        savedChartModel,
        spaceModel,
        pinnedListModel,
        resourceViewItemModel,
        projectModel,
        spacePermissionService,
    }: PinningServiceArguments) {
        super();
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.pinnedListModel = pinnedListModel;
        this.resourceViewItemModel = resourceViewItemModel;
        this.projectModel = projectModel;
        this.spacePermissionService = spacePermissionService;
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

        const [allPinnedSpaceBases, pinnedItemSpaceUuids] = await Promise.all([
            this.resourceViewItemModel.getAllSpacesByPinnedListUuid(
                projectUuid,
                pinnedListUuid,
            ),
            this.resourceViewItemModel.getSpaceUuidsForPinnedItems(
                projectUuid,
                pinnedListUuid,
            ),
        ]);

        const pinnedSpaceUuids = allPinnedSpaceBases.map((s) => s.data.uuid);
        const allRelevantSpaceUuids = [
            ...new Set([...pinnedSpaceUuids, ...pinnedItemSpaceUuids]),
        ];

        if (allRelevantSpaceUuids.length === 0) {
            return [];
        }

        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                allRelevantSpaceUuids,
            );

        if (allowedSpaceUuids.length === 0) {
            return [];
        }

        const allowedSpaceUuidsSet = new Set(allowedSpaceUuids);

        const allowedPinnedSpaceBases = allPinnedSpaceBases.filter(
            ({ data: { uuid } }) => allowedSpaceUuidsSet.has(uuid),
        );

        const allowedPinnedSpaceUuids = allowedPinnedSpaceBases.map(
            (s) => s.data.uuid,
        );
        const [
            directAccessMap,
            { charts: allowedCharts, dashboards: allowedDashboards },
        ] = await Promise.all([
            this.spacePermissionService.getDirectAccessUserUuids(
                allowedPinnedSpaceUuids,
            ),
            this.resourceViewItemModel.getAllowedChartsAndDashboards(
                projectUuid,
                pinnedListUuid,
                allowedSpaceUuids,
            ),
        ]);

        const allowedPinnedSpaces: ResourceViewSpaceItem[] =
            allowedPinnedSpaceBases.map((item) => {
                const directAccessUuids = directAccessMap[item.data.uuid] ?? [];
                return {
                    type: ResourceViewItemType.SPACE,
                    data: {
                        ...item.data,
                        access: directAccessUuids,
                        accessListLength: directAccessUuids.length,
                    },
                };
            });

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
