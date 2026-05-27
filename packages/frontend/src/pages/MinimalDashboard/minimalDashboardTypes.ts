import type {
    Dashboard,
    DashboardFilterRule,
    DashboardTab,
    ParametersValuesMap,
} from '@lightdash/common';
import type { FC } from 'react';
import type { Layout } from 'react-grid-layout';

export type MinimalDashboardTabGroup = {
    key: string;
    tiles: Dashboard['tiles'];
    layouts: { lg: Layout[]; md: Layout[] };
};

export type MinimalDashboardModel = {
    projectUuid?: string;
    dashboardUuid?: string;
    dashboard: Dashboard;
    activeTab: DashboardTab | null;
    navigableTabs: DashboardTab[];
    filteredAndSortedDashboardTiles: Dashboard['tiles'];
    layouts: { lg: Layout[]; md: Layout[] };
    tabGroups: MinimalDashboardTabGroup[] | null;
    schedulerFilters: DashboardFilterRule[] | undefined;
    schedulerParameters: ParametersValuesMap | undefined;
    schedulerTabsSelected: string[] | undefined;
    dateZoom: string | undefined;
    isTabEmpty: boolean;
    canNavigateBetweenTabs: boolean;
    onTabChange: (tabUuid: string) => void;
};

export type MinimalDashboardShellProps = {
    model: MinimalDashboardModel;
    scrollContainer?: HTMLElement | null;
};

export type MinimalDashboardShellComponent = FC<MinimalDashboardShellProps>;
