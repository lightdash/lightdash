import {
    type ResourceViewChartItem,
    type ResourceViewDashboardItem,
    type ResourceViewDataAppItem,
    type ResourceViewItemType,
    type ResourceViewSpaceItem,
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
    appUuid?: string;
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

export type CreateAppPinnedItem = {
    projectUuid: string;
    appUuid: string;
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

export type DeleteAppPinnedItem = {
    pinnedListUuid: string;
    appUuid: string;
};

export type DeletePinnedItem =
    | DeleteChartPinnedItem
    | DeleteDashboardPinnedItem
    | DeleteSpacePinnedItem
    | DeleteAppPinnedItem;

export type CreatePinnedItem =
    | CreateChartPinnedItem
    | CreateDashboardPinnedItem
    | CreateSpacePinnedItem
    | CreateAppPinnedItem;

export type UpdatePinnedItemOrder = {
    type: ResourceViewItemType;
    data: Pick<
        | ResourceViewChartItem['data']
        | ResourceViewDashboardItem['data']
        | ResourceViewSpaceItem['data']
        | ResourceViewDataAppItem['data'],
        'uuid' | 'pinnedListOrder'
    >;
};

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

export const isCreateAppPinnedItem = (
    item: CreatePinnedItem,
): item is CreateAppPinnedItem => 'appUuid' in item && !!item.appUuid;

export const isDeleteAppPinnedItem = (
    item: DeletePinnedItem,
): item is DeleteAppPinnedItem => 'appUuid' in item && !!item.appUuid;

export type ApiPinnedItems = {
    status: 'ok';
    results: PinnedItems;
};

export type PinnedItems = Array<
    | ResourceViewDashboardItem
    | ResourceViewChartItem
    | ResourceViewSpaceItem
    | ResourceViewDataAppItem
>;

export type TogglePinnedItemInfo = {
    pinnedListUuid: string;
    projectUuid: string;
    spaceUuid: string;
    isPinned: boolean;
};

export type ApiTogglePinnedItem = {
    status: 'ok';
    results: TogglePinnedItemInfo;
};
