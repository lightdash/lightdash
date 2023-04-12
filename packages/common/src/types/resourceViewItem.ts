import assertUnreachable from '../utils/assertUnreachable';
import { DashboardBasicDetails } from './dashboard';
import { SpaceQuery } from './savedCharts';
import { Space } from './space';

export enum ResourceViewItemType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
}

export type ResourceViewChartItem = {
    type: ResourceViewItemType.CHART;
    data: SpaceQuery;
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
        | 'updatedAt'
        | 'updatedByUser'
    >;
};

export type ResourceViewSpaceItem = {
    type: ResourceViewItemType.SPACE;
    data: Pick<
        Space,
        'projectUuid' | 'uuid' | 'name' | 'isPrivate' | 'pinnedListUuid'
    > & {
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
    space: Space,
): ResourceViewSpaceItem['data'] => ({
    projectUuid: space.projectUuid,
    uuid: space.uuid,
    name: space.name,
    isPrivate: space.isPrivate,
    pinnedListUuid: space.pinnedListUuid,
    accessListLength: space.access.length,
    dashboardCount: space.dashboards.length,
    chartCount: space.queries.length,
});
