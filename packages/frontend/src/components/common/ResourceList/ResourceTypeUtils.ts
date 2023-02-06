import {
    assertUnreachable,
    DashboardBasicDetails,
    SpaceQuery,
} from '@lightdash/common';

export enum ResourceListType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
}

type AcceptedResources = SpaceQuery | DashboardBasicDetails;

export type ResourceListItem =
    | { type: ResourceListType.CHART; data: SpaceQuery }
    | { type: ResourceListType.DASHBOARD; data: DashboardBasicDetails };

export const wrapResource = (
    resource: AcceptedResources,
    type: ResourceListType,
): ResourceListItem => {
    switch (type) {
        case ResourceListType.CHART:
            return { type, data: resource as SpaceQuery };
        case ResourceListType.DASHBOARD:
            return { type, data: resource as DashboardBasicDetails };
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
