import {
    assertUnreachable,
    DashboardBasicDetails,
    Space,
    SpaceQuery,
} from '@lightdash/common';

export enum ResourceListType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
}

type AcceptedResources = SpaceQuery | DashboardBasicDetails | Space;

export type ResourceListChartItem = {
    type: ResourceListType.CHART;
    data: SpaceQuery;
};

export type ResourceListDashboardItem = {
    type: ResourceListType.DASHBOARD;
    data: DashboardBasicDetails;
};

export type ResourceListSpaceItem = {
    type: ResourceListType.SPACE;
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
        resource.type === ResourceListType.CHART ||
        resource.type === ResourceListType.DASHBOARD
    );
};

export const wrapResource = (
    resource: AcceptedResources,
    type: ResourceListType,
): ResourceListItem => {
    switch (type) {
        case ResourceListType.CHART:
            return { type, data: resource as SpaceQuery };
        case ResourceListType.DASHBOARD:
            return { type, data: resource as DashboardBasicDetails };
        case ResourceListType.SPACE:
            return { type, data: resource as Space };
        default:
            return assertUnreachable(type, `Unknown resource type: ${type}`);
    }
};

export const wrapResourceList = (
    resources: AcceptedResources[],
    type: ResourceListType,
): ResourceListItem[] => {
    return resources.map((resource) => wrapResource(resource, type));
};
