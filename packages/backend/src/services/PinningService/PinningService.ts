import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ResourceViewItemType,
    type PinnedItems,
    type RegisteredAccount,
    type ResourceViewSpaceItem,
    type UpdatePinnedItemOrder,
} from '@lightdash/common';
import { toSessionUser } from '../../auth/account';
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
        account: RegisteredAccount,
        projectUuid: string,
        pinnedListUuid: string,
    ): Promise<PinnedItems> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    ...project,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((s) => s.uuid);
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                toSessionUser(account),
                spaceUuids,
            );

        if (allowedSpaceUuids.length === 0) {
            return [];
        }

        const allPinnedSpaceBases =
            await this.resourceViewItemModel.getAllSpacesByPinnedListUuid(
                projectUuid,
                pinnedListUuid,
            );

        const allowedPinnedSpaceBases = allPinnedSpaceBases.filter(
            ({ data: { uuid } }) => allowedSpaceUuids.includes(uuid),
        );

        // Enrich pinned spaces with access data from SpacePermissionService
        const pinnedSpaceUuids = allowedPinnedSpaceBases.map(
            (s) => s.data.uuid,
        );
        const directAccessMap =
            await this.spacePermissionService.getDirectAccessUserUuids(
                pinnedSpaceUuids,
            );
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

        const {
            charts: allowedCharts,
            dashboards: allowedDashboards,
            apps: allowedApps,
        } = await this.resourceViewItemModel.getAllowedChartsAndDashboards(
            projectUuid,
            pinnedListUuid,
            allowedSpaceUuids,
        );

        return [
            ...allowedPinnedSpaces,
            ...allowedCharts,
            ...allowedDashboards,
            ...allowedApps,
        ];
    }

    async updatePinnedItemsOrder(
        account: RegisteredAccount,
        projectUuid: string,
        pinnedListUuid: string,
        itemsOrder: Array<UpdatePinnedItemOrder>,
    ): Promise<PinnedItems> {
        const project = await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('PinnedItems', {
                    ...project,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.name,
                    },
                }),
            )
        ) {
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
        return this.getPinnedItems(account, projectUuid, pinnedListUuid);
    }
}
