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

export type ResourceListChartItem = {
    type: ResourceViewItemType.CHART;
    data: SpaceQuery;
};

export type ResourceListDashboardItem = {
    type: ResourceViewItemType.DASHBOARD;
    data: DashboardBasicDetails;
};

export type ResourceListSpaceItem = {
    type: ResourceViewItemType.SPACE;
    data: Space;
};

export type ResourceListItem =
    | ResourceListChartItem
    | ResourceListDashboardItem
    | ResourceListSpaceItem;

export type ResourceListItemCanBelongToSpace =
    | ResourceListChartItem
    | ResourceListDashboardItem;

export const isResourceListItemCanBelongToSpace = (
    resource: ResourceListItem,
): resource is ResourceListItemCanBelongToSpace => {
    return (
        resource.type === ResourceViewItemType.CHART ||
        resource.type === ResourceViewItemType.DASHBOARD
    );
};

export const wrapResource = <T extends AcceptedResources>(
    resource: T,
    type: ResourceViewItemType,
): ResourceListItem => {
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

export const wrapResourceList = (
    resources: AcceptedResources[],
    type: ResourceViewItemType,
): ResourceListItem[] => {
    return resources.map((resource) => wrapResource(resource, type));
};
