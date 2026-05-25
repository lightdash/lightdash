import { DateGranularity, type DashboardTab } from '@lightdash/common';

type DashboardPagePathArgs = {
    projectUuid?: string;
    dashboardUuid?: string;
    mode?: string;
    tabUuid?: string;
};

export const sortDashboardTabs = (tabs: DashboardTab[]) =>
    [...tabs].sort((a, b) => a.order - b.order);

export const getActiveDashboardTab = ({
    tabs,
    tabUuid,
    isEditMode,
}: {
    tabs: DashboardTab[];
    tabUuid?: string;
    isEditMode: boolean;
}) => {
    const sortedTabs = sortDashboardTabs(tabs);
    if (sortedTabs.length === 0) return undefined;

    const selectableTabs = isEditMode
        ? sortedTabs
        : sortedTabs.filter((tab) => !tab.hidden);
    const fallbackTabs =
        selectableTabs.length > 0 ? selectableTabs : sortedTabs;

    return fallbackTabs.find((tab) => tab.uuid === tabUuid) ?? fallbackTabs[0];
};

export const getDateZoomGranularityFromSearch = (
    search: string,
): DateGranularity | string | undefined => {
    const searchParams = new URLSearchParams(search);
    const dateZoomParam = searchParams.get('dateZoom');
    if (!dateZoomParam) return undefined;

    const standardMatch = Object.values(DateGranularity).find(
        (granularity) =>
            granularity.toLowerCase() === dateZoomParam.toLowerCase(),
    );

    return standardMatch ?? dateZoomParam;
};

export const getDashboardTabPath = ({
    projectUuid,
    dashboardUuid,
    mode,
    tabUuid,
}: DashboardPagePathArgs) => {
    if (!projectUuid || !dashboardUuid) return undefined;

    const resolvedMode = mode ?? 'view';
    const basePath = `/projects/${projectUuid}/dashboards/${dashboardUuid}/${resolvedMode}`;

    return tabUuid ? `${basePath}/tabs/${tabUuid}` : basePath;
};

export const getMinimalDashboardTabPath = ({
    projectUuid,
    dashboardUuid,
    tabUuid,
}: DashboardPagePathArgs) => {
    if (!projectUuid || !dashboardUuid) return undefined;

    const basePath = `/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}`;

    return tabUuid ? `${basePath}/view/tabs/${tabUuid}` : basePath;
};

export const getEmbedDashboardTabPath = ({
    projectUuid,
    tabUuid,
}: DashboardPagePathArgs) => {
    if (!projectUuid) return undefined;

    const basePath = `/embed/${projectUuid}`;

    return tabUuid ? `${basePath}/tabs/${tabUuid}` : basePath;
};
