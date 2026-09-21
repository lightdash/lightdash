import { subject } from '@casl/ability';
import {
    DirectAccessResourceType,
    ForbiddenError,
    ResourceViewItemType,
    type PinnedItems,
    type RegisteredAccount,
    type ResourceViewSpaceItem,
    type SessionUser,
    type TogglePinnedItemInfo,
    type UpdatePinnedItemOrder,
    type UuidOrSlug,
} from '@lightdash/common';
import { toSessionUser } from '../../auth/account';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ResourceViewItemModel } from '../../models/ResourceViewItemModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import type { DirectAccessService } from '../DirectAccess/DirectAccessService';
import type { DocumentService } from '../DocumentService/DocumentService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type PinningServiceArguments = {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;
    resourceViewItemModel: ResourceViewItemModel;
    projectModel: ProjectModel;
    spacePermissionService: SpacePermissionService;
    directAccessService: DirectAccessService;
    documentService: DocumentService;
};

export class PinningService extends BaseService {
    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    pinnedListModel: PinnedListModel;

    resourceViewItemModel: ResourceViewItemModel;

    projectModel: ProjectModel;

    spacePermissionService: SpacePermissionService;

    directAccessService: DirectAccessService;
    documentService: DocumentService;

    constructor({
        dashboardModel,
        savedChartModel,
        spaceModel,
        pinnedListModel,
        resourceViewItemModel,
        projectModel,
        spacePermissionService,
        directAccessService,
        documentService,
    }: PinningServiceArguments) {
        super();
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.pinnedListModel = pinnedListModel;
        this.resourceViewItemModel = resourceViewItemModel;
        this.projectModel = projectModel;
        this.spacePermissionService = spacePermissionService;
        this.directAccessService = directAccessService;
        this.documentService = documentService;
    }

    async getPinnedItems(
        account: RegisteredAccount,
        projectUuid: string,
        pinnedListUuid: string,
    ): Promise<PinnedItems> {
        const user = toSessionUser(account);
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

        const [{ items, sharedAccess }, allowedDocuments] = await Promise.all([
            this.getPinnedSpaceContent(user, projectUuid, pinnedListUuid),
            this.getViewablePinnedDocuments(
                account,
                projectUuid,
                pinnedListUuid,
            ),
        ]);
        return [
            ...items,
            ...allowedDocuments.map((item) => ({
                ...item,
                data: {
                    ...item.data,
                    directAccessRoles:
                        sharedAccess?.rolesByType[
                            DirectAccessResourceType.DOCUMENT
                        ][item.data.uuid] ?? [],
                },
            })),
        ].sort(
            (left, right) =>
                (left.data.pinnedListOrder ?? 100) -
                (right.data.pinnedListOrder ?? 100),
        );
    }

    private async getPinnedSpaceContent(
        user: SessionUser,
        projectUuid: string,
        pinnedListUuid: string,
    ) {
        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((s) => s.uuid);
        const [allowedSpaceUuids, sharedAccess] = await Promise.all([
            this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            ),
            // Pinned content the caller was directly granted stays visible
            // even without any space access path.
            user.organizationUuid
                ? this.directAccessService.findSharedWithMeAccess(
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      [projectUuid],
                  )
                : undefined,
        ]);
        const granted = sharedAccess?.uuidsByType;
        const grantedChartUuids =
            granted?.[DirectAccessResourceType.CHART] ?? [];
        const grantedDashboardUuids =
            granted?.[DirectAccessResourceType.DASHBOARD] ?? [];
        const grantedAppUuids = granted?.[DirectAccessResourceType.APP] ?? [];

        if (
            allowedSpaceUuids.length === 0 &&
            grantedChartUuids.length === 0 &&
            grantedDashboardUuids.length === 0 &&
            grantedAppUuids.length === 0
        ) {
            return { items: [], sharedAccess };
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
            {
                chartUuids: grantedChartUuids,
                dashboardUuids: grantedDashboardUuids,
                appUuids: grantedAppUuids,
            },
        );

        return {
            items: [
                ...allowedPinnedSpaces,
                ...allowedCharts,
                ...allowedDashboards,
                ...allowedApps,
            ],
            sharedAccess,
        };
    }

    private async getViewablePinnedDocuments(
        account: RegisteredAccount,
        projectUuid: string,
        pinnedListUuid: string,
    ) {
        const pinnedDocuments =
            await this.resourceViewItemModel.getPinnedDocuments(
                projectUuid,
                pinnedListUuid,
            );
        const allowedDocumentUuids = new Set(
            await this.documentService.filterViewableUuids(
                account,
                [projectUuid],
                pinnedDocuments.map(({ data }) => data.uuid),
            ),
        );
        return pinnedDocuments.filter(({ data }) =>
            allowedDocumentUuids.has(data.uuid),
        );
    }

    async toggleDocumentPin(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuidOrSlug: UuidOrSlug,
    ): Promise<TogglePinnedItemInfo> {
        const document = await this.documentService.getByIdOrSlug(
            account,
            projectUuid,
            documentUuidOrSlug,
        );
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('PinnedItems', {
                    projectUuid,
                    organizationUuid: document.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const isPinned = document.pinnedListUuid !== null;
        if (document.pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid: document.pinnedListUuid,
                documentUuid: document.documentUuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                documentUuid: document.documentUuid,
            });
        }
        const list =
            await this.pinnedListModel.getPinnedListAndItems(projectUuid);
        return {
            projectUuid,
            spaceUuid: document.spaceUuid,
            pinnedListUuid: list.pinnedListUuid,
            isPinned: !isPinned,
        };
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
        const documentUuids = itemsOrder
            .filter(({ type }) => type === ResourceViewItemType.DOCUMENT)
            .map(({ data }) => data.uuid);
        if (documentUuids.length > 0) {
            const pinnedDocuments =
                await this.resourceViewItemModel.getPinnedDocuments(
                    projectUuid,
                    pinnedListUuid,
                );
            const allowedDocumentUuids =
                await this.documentService.filterViewableUuids(
                    account,
                    [projectUuid],
                    pinnedDocuments.map(({ data }) => data.uuid),
                );
            if (
                documentUuids.some(
                    (uuid) => !allowedDocumentUuids.includes(uuid),
                )
            ) {
                throw new ForbiddenError(
                    'Cannot reorder inaccessible pinned Documents',
                );
            }
        }
        await this.pinnedListModel.updatePinnedItemsOrder(
            projectUuid,
            pinnedListUuid,
            itemsOrder,
        );
        return this.getPinnedItems(account, projectUuid, pinnedListUuid);
    }
}
