import { type Dashboard } from '@lightdash/common';

export const getActiveTabForTabs = (
    dashboardTabs: Dashboard['tabs'],
    tabUuid: string | undefined,
    isEditMode: boolean,
    currentActiveTab: Dashboard['tabs'][number] | undefined,
) => {
    if (dashboardTabs.length === 0) return undefined;

    const selectableTabs = isEditMode
        ? dashboardTabs
        : dashboardTabs.filter((tab) => !tab.hidden);
    const tabsForFallback =
        selectableTabs.length > 0 ? selectableTabs : dashboardTabs;
    const urlMatch = selectableTabs.find((tab) => tab.uuid === tabUuid);
    if (urlMatch) return urlMatch;

    const currentMatch =
        tabUuid === undefined
            ? selectableTabs.find((tab) => tab.uuid === currentActiveTab?.uuid)
            : undefined;
    if (currentMatch) return currentMatch;
    if (currentActiveTab) return currentActiveTab;

    return tabsForFallback[0];
};
