import { type AppVersionStatus } from '../ee/apps/types';
import assertUnreachable from '../utils/assertUnreachable';
import {
    ContentType as ResourceViewItemType,
    type ChartSourceType,
    type SummaryContent,
} from './content';
import { type DashboardBasicDetails } from './dashboard';
import { type SpaceQuery } from './savedCharts';
import { type Space, type SpaceSummary } from './space';

export { ResourceViewItemType };

export enum ResourceItemCategory {
    MOST_POPULAR = 'mostPopular',
    RECENTLY_UPDATED = 'recentlyUpdated',
    PINNED = 'pinned',
    FAVORITES = 'favorites',
    VERIFIED = 'verified',
}

export type ResourceViewChartItem = {
    type: ResourceViewItemType.CHART;
    data: Pick<
        SpaceQuery,
        | 'uuid'
        | 'name'
        | 'chartType'
        | 'chartKind'
        | 'firstViewedAt'
        | 'views'
        | 'pinnedListUuid'
        | 'pinnedListOrder'
        | 'spaceUuid'
        | 'description'
        | 'updatedAt'
        | 'updatedByUser'
        | 'validationErrors'
        | 'verification'
        | 'slug'
    > & { source?: ChartSourceType };
    category?: ResourceItemCategory;
};

export type ResourceViewDashboardItem = {
    type: ResourceViewItemType.DASHBOARD;
    data: Pick<
        DashboardBasicDetails,
        | 'uuid'
        | 'spaceUuid'
        | 'description'
        | 'name'
        | 'views'
        | 'firstViewedAt'
        | 'pinnedListUuid'
        | 'pinnedListOrder'
        | 'updatedAt'
        | 'updatedByUser'
        | 'validationErrors'
        | 'verification'
    >;
    category?: ResourceItemCategory;
};

export type ResourceViewSpaceItem = {
    type: ResourceViewItemType.SPACE;
    data: Pick<
        Space,
        | 'projectUuid'
        | 'uuid'
        | 'name'
        | 'pinnedListUuid'
        | 'pinnedListOrder'
        | 'organizationUuid'
        | 'parentSpaceUuid'
        | 'path'
        | 'inheritParentPermissions'
    > & {
        access: string[];
        accessListLength: number;
        dashboardCount: number;
        chartCount: number;
        childSpaceCount: number;
        appCount: number;
    };
};

export type ResourceViewDataAppItem = {
    type: ResourceViewItemType.DATA_APP;
    data: {
        uuid: string;
        name: string;
        description: string | undefined;
        spaceUuid: string | null;
        updatedAt: Date;
        updatedByUser: {
            userUuid: string;
            firstName: string;
            lastName: string;
        } | null;
        views: number;
        firstViewedAt: Date | null;
        latestVersionNumber: number | null;
        latestVersionStatus: AppVersionStatus | null;
        pinnedListUuid: string | null;
        pinnedListOrder: number | null;
    };
    category?: ResourceItemCategory;
};

type ResourceViewAcceptedItems =
    | ResourceViewSpaceItem['data']
    | ResourceViewChartItem['data']
    | ResourceViewDashboardItem['data']
    | ResourceViewDataAppItem['data'];

export type ResourceViewItem =
    | ResourceViewChartItem
    | ResourceViewDashboardItem
    | ResourceViewSpaceItem
    | ResourceViewDataAppItem;

export const isResourceViewItemChart = (
    item: ResourceViewItem,
): item is ResourceViewChartItem => item.type === ResourceViewItemType.CHART;

export const isResourceViewItemDashboard = (
    item: ResourceViewItem,
): item is ResourceViewDashboardItem =>
    item.type === ResourceViewItemType.DASHBOARD;

export const isResourceViewSpaceItem = (
    item: ResourceViewItem,
): item is ResourceViewSpaceItem => item.type === ResourceViewItemType.SPACE;

export const isResourceViewDataAppItem = (
    item: ResourceViewItem,
): item is ResourceViewDataAppItem =>
    item.type === ResourceViewItemType.DATA_APP;

export const wrapResource = <T extends ResourceViewAcceptedItems>(
    resource: T,
    type: ResourceViewItemType,
): ResourceViewItem => {
    switch (type) {
        case ResourceViewItemType.CHART:
            return { type, data: resource as SpaceQuery };
        case ResourceViewItemType.DASHBOARD:
            return { type, data: resource as DashboardBasicDetails };
        case ResourceViewItemType.SPACE:
            return { type, data: resource as ResourceViewSpaceItem['data'] };
        case ResourceViewItemType.DATA_APP:
            return {
                type,
                data: resource as ResourceViewDataAppItem['data'],
            };
        default:
            return assertUnreachable(type, `Unknown resource type: ${type}`);
    }
};

export const wrapResourceView = (
    resources: ResourceViewAcceptedItems[],
    type: ResourceViewItemType,
): ResourceViewItem[] =>
    resources.map((resource) => wrapResource(resource, type));

export const spaceToResourceViewItem = (
    space: Omit<SpaceSummary, 'inheritsFromOrgOrProject'>,
): ResourceViewSpaceItem['data'] => ({
    organizationUuid: space.organizationUuid,
    projectUuid: space.projectUuid,
    uuid: space.uuid,
    name: space.name,
    inheritParentPermissions: space.inheritParentPermissions,
    pinnedListUuid: space.pinnedListUuid,
    pinnedListOrder: space.pinnedListOrder,
    accessListLength: space.access.length,
    dashboardCount: space.dashboardCount,
    chartCount: space.chartCount,
    childSpaceCount: space.childSpaceCount,
    appCount: space.appCount,
    access: space.access,
    parentSpaceUuid: space.parentSpaceUuid,
    path: space.path,
});

export type MostPopularAndRecentlyUpdated = {
    mostPopular: (DashboardBasicDetails | SpaceQuery)[];
    recentlyUpdated: (DashboardBasicDetails | SpaceQuery)[];
};

export const contentToResourceViewItem = (content: SummaryContent) => {
    const updatedByUser =
        content.lastUpdatedBy || content.createdBy || undefined;

    switch (content.contentType) {
        case ResourceViewItemType.CHART:
            const chartViewItem: ResourceViewChartItem['data'] & {
                projectUuid: string;
                organizationUuid: string;
            } = {
                ...content,
                description: content.description || undefined,
                spaceUuid: content.space.uuid,
                pinnedListUuid: content.pinnedList?.uuid || null,
                pinnedListOrder: null,
                updatedAt: content.lastUpdatedAt || content.createdAt,
                updatedByUser: updatedByUser && {
                    ...updatedByUser,
                    userUuid: updatedByUser.uuid,
                },
                verification: content.verification,
                projectUuid: content.project.uuid, // Required for permission checks in ResourceActionMenu
                organizationUuid: content.organization.uuid,
            };
            return wrapResource(chartViewItem, ResourceViewItemType.CHART);
        case ResourceViewItemType.DASHBOARD:
            const dashboardViewItem: ResourceViewDashboardItem['data'] & {
                projectUuid: string;
                organizationUuid: string;
            } = {
                ...content,
                description: content.description || undefined,
                spaceUuid: content.space.uuid,
                pinnedListUuid: content.pinnedList?.uuid || null,
                pinnedListOrder: null,
                updatedAt: content.lastUpdatedAt || content.createdAt,
                updatedByUser: updatedByUser && {
                    ...updatedByUser,
                    userUuid: updatedByUser.uuid,
                },
                verification: content.verification,
                projectUuid: content.project.uuid,
                organizationUuid: content.organization.uuid,
            };
            return wrapResource(
                dashboardViewItem,
                ResourceViewItemType.DASHBOARD,
            );
        case ResourceViewItemType.SPACE:
            return wrapResource(
                spaceToResourceViewItem({
                    ...content,
                    organizationUuid: content.organization.uuid,
                    projectUuid: content.project.uuid,
                    pinnedListUuid: content.pinnedList?.uuid || null,
                    pinnedListOrder: content.pinnedList?.order || null,
                    userAccess: undefined, // This property is not needed for the resource view item
                    projectMemberAccessRole: null,
                    parentSpaceUuid: content.parentSpaceUuid,
                    path: content.path,
                }),
                ResourceViewItemType.SPACE,
            );
        case ResourceViewItemType.DATA_APP:
            const dataAppViewItem: ResourceViewDataAppItem['data'] = {
                uuid: content.uuid,
                name: content.name,
                description: content.description || undefined,
                spaceUuid: content.space.uuid,
                updatedAt: content.lastUpdatedAt || content.createdAt,
                updatedByUser: updatedByUser
                    ? {
                          userUuid: updatedByUser.uuid,
                          firstName: updatedByUser.firstName,
                          lastName: updatedByUser.lastName,
                      }
                    : null,
                views: content.views,
                firstViewedAt: content.firstViewedAt,
                latestVersionNumber: content.latestVersionNumber,
                latestVersionStatus: content.latestVersionStatus,
                pinnedListUuid: content.pinnedList?.uuid || null,
                pinnedListOrder: content.pinnedList?.order || null,
            };
            return wrapResource(dataAppViewItem, ResourceViewItemType.DATA_APP);
        default:
            return assertUnreachable(content, `Unsupported content type`);
    }
};

export const resourceToContent = (resource: ResourceViewItem) => {
    switch (resource.type) {
        case ResourceViewItemType.CHART:
            return resource.data;
        case ResourceViewItemType.DASHBOARD:
            return resource.data;
        case ResourceViewItemType.SPACE:
            return resource.data;
        case ResourceViewItemType.DATA_APP:
            return resource.data;
        default:
            return assertUnreachable(resource, `Unsupported resource type`);
    }
};
