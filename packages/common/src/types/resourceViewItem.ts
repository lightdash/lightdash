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
        | 'isPrivate'
        | 'pinnedListUuid'
        | 'pinnedListOrder'
        | 'organizationUuid'
        | 'parentSpaceUuid'
        | 'path'
    > & {
        access: string[];
        accessListLength: number;
        dashboardCount: number;
        chartCount: number;
    };
};

type ResourceViewAcceptedItems =
    | ResourceViewSpaceItem['data']
    | ResourceViewChartItem['data']
    | ResourceViewDashboardItem['data'];

export type ResourceViewItem =
    | ResourceViewChartItem
    | ResourceViewDashboardItem
    | ResourceViewSpaceItem;

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
    space: SpaceSummary,
): ResourceViewSpaceItem['data'] => ({
    organizationUuid: space.organizationUuid,
    projectUuid: space.projectUuid,
    uuid: space.uuid,
    name: space.name,
    isPrivate: space.isPrivate,
    pinnedListUuid: space.pinnedListUuid,
    pinnedListOrder: space.pinnedListOrder,
    accessListLength: space.access.length,
    dashboardCount: space.dashboardCount,
    chartCount: space.chartCount,
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
                    userAccess: undefined, // This propery is not needed for the resource view item
                    parentSpaceUuid: content.parentSpaceUuid,
                    path: content.path,
                }),
                ResourceViewItemType.SPACE,
            );
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
        default:
            return assertUnreachable(resource, `Unsupported resource type`);
    }
};
