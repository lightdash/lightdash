import { type DashboardTab } from '@lightdash/common';

export const sortDashboardTabs = (tabs: DashboardTab[]): DashboardTab[] =>
    [...tabs].sort((a, b) => a.order - b.order);

/**
 * The tab a new tile lands on: the user's pick, else the tab they last had
 * open on that dashboard, else the first tab. Null when the dashboard has no tabs.
 */
export const getDestinationDashboardTab = ({
    tabs,
    selectedTabUuid,
    lastActiveTabUuid,
}: {
    tabs: DashboardTab[];
    selectedTabUuid: string | null;
    lastActiveTabUuid: string | null;
}): DashboardTab | null => {
    const sortedTabs = sortDashboardTabs(tabs);
    return (
        sortedTabs.find((tab) => tab.uuid === selectedTabUuid) ??
        sortedTabs.find((tab) => tab.uuid === lastActiveTabUuid) ??
        sortedTabs[0] ??
        null
    );
};
