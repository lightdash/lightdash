import { useCallback } from 'react';
import { useIsLeftNavigationShown } from '../../components/AppSidebar/useIsLeftNavigationShown';
import { isDroppingDashboardChanges } from './dashboardChartPlace';
import useDashboardStorage from './useDashboardStorage';

type Navigation = {
    currentPathname: string;
    nextPathname: string;
    isNextTheSameSavedChart: boolean;
};

/**
 * Whether a navigation abandons a chart handed over by a dashboard, and the
 * dashboard's unsaved edits with it. Only the sidebar offers such a way out.
 */
export const useIsDroppingDashboardChanges = () => {
    const { getIsEditingDashboardChart, getHasDashboardChanges } =
        useDashboardStorage();
    const isLeftNavigationShown = useIsLeftNavigationShown();

    return useCallback(
        (navigation: Navigation) =>
            isLeftNavigationShown &&
            isDroppingDashboardChanges({
                ...navigation,
                isEditingDashboardChart: getIsEditingDashboardChart(),
                hasDashboardChanges: getHasDashboardChanges(),
            }),
        [
            isLeftNavigationShown,
            getIsEditingDashboardChart,
            getHasDashboardChanges,
        ],
    );
};
