import {
    ResourceViewChartItem,
    ResourceViewDashboardItem,
    ResourceViewSpaceItem,
} from './resourceViewItem';

export type PinnedList = {
    pinnedListUuid: string;
    projectUuid: string;
};

export type PinnedItem = {
    pinnedItemUuid: string;
    pinnedListUuid: string;
    savedChartUuid?: string;
    dashboardUuid?: string;
    spaceUuid?: string;
    createdAt: Date;
};

export type PinnedListAndItems = PinnedList & {
    items: PinnedItem[];
};

export type CreateChartPinnedItem = {
    projectUuid: string;
    savedChartUuid: string;
};

export type CreateDashboardPinnedItem = {
    projectUuid: string;
    dashboardUuid: string;
};

export type CreateSpacePinnedItem = {
    projectUuid: string;
    spaceUuid: string;
};

export type DeleteChartPinnedItem = {
    pinnedListUuid: string;
    savedChartUuid: string;
};

export type DeleteDashboardPinnedItem = {
    pinnedListUuid: string;
    dashboardUuid: string;
};

export type DeleteSpacePinnedItem = {
    pinnedListUuid: string;
    spaceUuid: string;
};

export type DeletePinnedItem =
    | DeleteChartPinnedItem
    | DeleteDashboardPinnedItem
    | DeleteSpacePinnedItem;

export type CreatePinnedItem =
    | CreateChartPinnedItem
    | CreateDashboardPinnedItem
    | CreateSpacePinnedItem;

export const isCreateChartPinnedItem = (
    item: CreatePinnedItem,
): item is CreateChartPinnedItem =>
    'savedChartUuid' in item && !!item.savedChartUuid;

export const isDeleteChartPinnedItem = (
    item: DeletePinnedItem,
): item is DeleteChartPinnedItem =>
    'savedChartUuid' in item && !!item.savedChartUuid;

export const isCreateSpacePinnedItem = (
    item: CreatePinnedItem,
): item is CreateSpacePinnedItem => 'spaceUuid' in item && !!item.spaceUuid;

export const isDeleteSpacePinnedItem = (
    item: DeletePinnedItem,
): item is DeleteSpacePinnedItem => 'spaceUuid' in item && !!item.spaceUuid;

export type PinnedDashboards = (Omit<ResourceViewDashboardItem, 'type'> & {
    order: number;
})[];
export type PinnedCharts = (Omit<ResourceViewChartItem, 'type'> & {
    order: number;
})[];
export type PinnedSpaces = (Omit<ResourceViewSpaceItem, 'type'> & {
    order: number;
})[];

export type ApiPinnedItems = {
    dashboards: PinnedDashboards;
    charts: PinnedCharts;
    spaces: PinnedSpaces;
};
