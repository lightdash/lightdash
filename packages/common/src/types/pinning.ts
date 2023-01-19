export type PinnedList = {
    pinnedListUuid: string;
    projectUuid: string;
};

export type CreateChartPinnedItem = {
    pinnedItemType: 'chart';
    projectUuid: string;
    savedChartUuid: string;
};

export type CreateDashboardPinnedItem = {
    pinnedItemType: 'dashboard';
    projectUuid: string;
    dashboardUuid: string;
};

export type DeleteChartPinnedItem = {
    pinnedListUuid: string;

    pinnedItemType: 'chart';
    savedChartUuid: string;
};
export type DeleteDashboardPinnedItem = {
    pinnedListUuid: string;

    pinnedItemType: 'dashboard';
    dashboardUuid: string;
};
