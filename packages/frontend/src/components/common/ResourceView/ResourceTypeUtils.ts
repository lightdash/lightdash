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

type AcceptedResources = SpaceQuery | DashboardBasicDetails | Space;

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

export type ResourceViewItemCanBelongToSpace =
    | ResourceViewChartItem
    | ResourceViewDashboardItem;

export const isResourceViewItemCanBelongToSpace = (
    resource: ResourceViewItem,
): resource is ResourceViewItemCanBelongToSpace => {
    return (
        resource.type === ResourceViewItemType.CHART ||
        resource.type === ResourceViewItemType.DASHBOARD
    );
};

export const wrapResource = <T extends AcceptedResources>(
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
    resources: AcceptedResources[],
    type: ResourceViewItemType,
): ResourceViewItem[] => {
    return resources.map((resource) => wrapResource(resource, type));
};
