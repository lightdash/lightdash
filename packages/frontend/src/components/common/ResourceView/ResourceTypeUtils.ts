import {
    assertUnreachable,
    DashboardBasicDetails,
    Space,
    SpaceQuery,
} from '@lightdash/common';

export enum ResourceViewItemType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
}

type ResourceViewAcceptedItems = SpaceQuery | DashboardBasicDetails | Space;

export type ResourceViewChartItem = {
    type: ResourceViewItemType.CHART;
    data: SpaceQuery;
};

export type ResourceViewDashboardItem = {
    type: ResourceViewItemType.DASHBOARD;
    data: DashboardBasicDetails;
};

export type ResourceViewSpaceItem = {
    type: ResourceViewItemType.SPACE;
    data: Space;
};

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
            return { type, data: resource as Space };
        default:
            return assertUnreachable(type, `Unknown resource type: ${type}`);
    }
};

export const wrapResourceView = (
    resources: ResourceViewAcceptedItems[],
    type: ResourceViewItemType,
): ResourceViewItem[] => {
    return resources.map((resource) => wrapResource(resource, type));
};
