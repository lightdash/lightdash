export type PinnedList = {
    pinnedListUuid: string;
    projectUuid: string;
};

export type CreateChartPinnedItem = {
    projectUuid: string;
    savedChartUuid: string;
};

export type CreateDashboardPinnedItem = {
    projectUuid: string;
    dashboardUuid: string;
};

export type DeleteChartPinnedItem = {
    pinnedListUuid: string;
    savedChartUuid: string;
};
export type DeleteDashboardPinnedItem = {
    pinnedListUuid: string;
    dashboardUuid: string;
};

export const isCreateChartPinnedItem = (
    item: CreateChartPinnedItem | CreateDashboardPinnedItem,
): item is CreateChartPinnedItem =>
    'savedChartUuid' in item && !!item.savedChartUuid;
export const isDeleteChartPinnedItem = (
    item: DeleteChartPinnedItem | DeleteDashboardPinnedItem,
): item is DeleteChartPinnedItem =>
    'savedChartUuid' in item && !!item.savedChartUuid;
